-- Squashed baseline: full schema as of 2026-09-02, replacing all earlier migrations.
-- Managed via supabase CLI; production history repaired to point at this file.

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--



--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: are_friends(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.are_friends(a uuid, b uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.friendships f
    WHERE f.status = 'accepted'
      AND ((f.requester_id = a AND f.addressee_id = b)
        OR (f.requester_id = b AND f.addressee_id = a))
  );
$$;


--
-- Name: board_uuid_of(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.board_uuid_of(p_board_id text) RETURNS uuid
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $_$
  select case
    when p_board_id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}(:live)?$'
      then substring(p_board_id from 1 for 36)::uuid
    else null
  end
$_$;


--
-- Name: boards_guard_owner(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.boards_guard_owner() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if (new.user_id is distinct from old.user_id
      or new.server_id is distinct from old.server_id)
     and old.user_id is distinct from auth.uid() then
    raise exception 'cannot change board ownership';
  end if;
  return new;
end;
$$;


--
-- Name: can_access_board(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_access_board(p_board_id text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select exists (
    select 1 from public.boards b
    where b.id = public.board_uuid_of(p_board_id)
      and (
        b.user_id = auth.uid()
        or exists (
          select 1 from public.board_collaborators c
          where c.board_id = b.id and c.user_id = auth.uid()
        )
        or exists (
          select 1 from public.server_members m
          where m.server_id = b.server_id and m.user_id = auth.uid()
        )
      )
  );
$$;


--
-- Name: can_access_board(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_access_board(p_board_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.boards b
    WHERE b.id = p_board_id
      AND (
        b.user_id = auth.uid()
        OR (
          b.server_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.server_members m
            WHERE m.server_id = b.server_id AND m.user_id = auth.uid()
          )
        )
      )
  );
$$;


--
-- Name: can_dm(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_dm(sender uuid, target uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT CASE (SELECT allow_dms_from FROM public.profiles WHERE id = target)
    WHEN 'none'    THEN FALSE
    WHEN 'friends' THEN public.are_friends(sender, target)
    ELSE TRUE   -- 'everyone' or profile missing
  END;
$$;


--
-- Name: can_moderate_board(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_moderate_board(p_board_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select exists (
    select 1 from public.boards b
    where b.id = p_board_id
      and (
        b.user_id = auth.uid()
        or exists (
          select 1 from public.servers s
          where s.id = b.server_id and s.owner_id = auth.uid()
        )
        or exists (
          select 1 from public.server_members m
          where m.server_id = b.server_id
            and m.user_id = auth.uid()
            and m.role in ('owner', 'admin')
        )
      )
  );
$$;


--
-- Name: community_category_counts(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.community_category_counts() RETURNS TABLE(category text, n bigint)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT category, COUNT(*) FROM community_boards GROUP BY category;
$$;


--
-- Name: contrib_guard_moderation_fields(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.contrib_guard_moderation_fields() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if (new.approved is distinct from old.approved
      or new.pinned is distinct from old.pinned)
     and not public.can_moderate_board(old.board_id) then
    raise exception 'not authorized to change moderation state';
  end if;
  return new;
end;
$$;


--
-- Name: create_board_share(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_board_share(p_board_id uuid) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_token text;
begin
  if not exists (select 1 from public.boards b where b.id = p_board_id and b.user_id = auth.uid()) then
    raise exception 'not your board' using errcode = '42501';
  end if;
  select token into v_token from public.board_share_links where board_id = p_board_id;
  if v_token is null then
    insert into public.board_share_links (board_id, created_by)
      values (p_board_id, auth.uid())
      returning token into v_token;
  end if;
  return v_token;
end;
$$;


--
-- Name: delete_contribution(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_contribution(p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_board uuid; v_author uuid;
begin
  select board_id, author_id into v_board, v_author
    from public.board_item_contributions where id = p_id;
  if v_board is null then return; end if; -- already gone
  if v_author = auth.uid() or public.can_moderate_board(v_board) then
    delete from public.board_item_contributions where id = p_id;
  else
    raise exception 'not authorized to delete this contribution';
  end if;
end;
$$;


--
-- Name: get_invite(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_invite(invite_code text) RETURNS TABLE(code text, server_id uuid, server_name text, server_icon text, server_description text, member_count integer, is_public boolean, expired boolean)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select
    i.code,
    i.server_id,
    s.name,
    s.icon,
    s.description,
    s.member_count,
    s.is_public,
    (i.expires_at is not null and i.expires_at < now())
      or (i.max_uses is not null and i.uses_count >= i.max_uses) as expired
  from public.server_invites i
  join public.servers s on s.id = i.server_id
  where i.code = invite_code
  limit 1;
$$;


--
-- Name: handle_new_server(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_server() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  insert into public.server_members (server_id, user_id, role)
  values (new.id, new.owner_id, 'owner');
  return new;
end;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  insert into public.profiles (id, display_name, avatar_url, color)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(new.email, '@', 1),
      'Anonymous'
    ),
    new.raw_user_meta_data ->> 'avatar_url',
    '#d59ee8'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;


--
-- Name: increment_community_board_uses(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.increment_community_board_uses(p_board_id uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  UPDATE public.community_boards SET uses = uses + 1 WHERE id = p_board_id;
$$;


--
-- Name: is_board_collaborator(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_board_collaborator(p_board_id uuid) RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select exists (
    select 1 from public.board_collaborators c
    where c.board_id = p_board_id and c.user_id = auth.uid()
  );
$$;


--
-- Name: is_board_editor(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_board_editor(p_board_id uuid) RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select exists (
    select 1 from public.board_collaborators c
    where c.board_id = p_board_id and c.user_id = auth.uid() and c.can_edit
  );
$$;


--
-- Name: is_member_of_server(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_member_of_server(server_uuid uuid) RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.server_members
    WHERE server_id = server_uuid
      AND user_id = auth.uid()
  );
$$;


--
-- Name: rate_community_board(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rate_community_board(p_board_id uuid, p_rating integer) RETURNS TABLE(r_sum integer, r_count integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_user UUID := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF p_rating < 1 OR p_rating > 5 THEN
    RAISE EXCEPTION 'rating out of range';
  END IF;
  INSERT INTO community_board_ratings (board_id, user_id, rating)
  VALUES (p_board_id, v_user, p_rating)
  ON CONFLICT (board_id, user_id)
  DO UPDATE SET rating = EXCLUDED.rating, updated_at = NOW();
  RETURN QUERY SELECT b.rating_sum, b.rating_count FROM community_boards b WHERE b.id = p_board_id;
END;
$$;


--
-- Name: redeem_board_share(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.redeem_board_share(p_token text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_uid uuid := auth.uid(); v_link public.board_share_links;
begin
  if v_uid is null then raise exception 'authentication required' using errcode = '28000'; end if;
  select * into v_link from public.board_share_links where token = p_token;
  if not found then raise exception 'invalid share link'; end if;
  insert into public.board_collaborators (board_id, user_id, can_edit)
    values (v_link.board_id, v_uid, v_link.can_edit)
    on conflict (board_id, user_id) do nothing;
  return v_link.board_id;
end;
$$;


--
-- Name: redeem_invite(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.redeem_invite(invite_code text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_uid    uuid := auth.uid();
  v_invite public.server_invites;
begin
  -- Guests / unauthenticated callers cannot join.
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select * into v_invite from public.server_invites where code = invite_code;
  if not found then
    raise exception 'invalid invite';
  end if;

  if v_invite.expires_at is not null and v_invite.expires_at < now() then
    raise exception 'invite expired';
  end if;

  if v_invite.max_uses is not null and v_invite.uses_count >= v_invite.max_uses then
    raise exception 'invite limit reached';
  end if;

  -- Idempotent: already a member → just return the server id (don't bump uses).
  if exists (
    select 1 from public.server_members
    where server_id = v_invite.server_id and user_id = v_uid
  ) then
    return v_invite.server_id;
  end if;

  insert into public.server_members (server_id, user_id, role)
  values (v_invite.server_id, v_uid, 'member');

  update public.server_invites
    set uses_count = uses_count + 1
    where id = v_invite.id;

  return v_invite.server_id;
end;
$$;


--
-- Name: reset_board_share(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reset_board_share(p_board_id uuid) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_can_edit boolean; v_token text;
begin
  if not exists (select 1 from public.boards b where b.id = p_board_id and b.user_id = auth.uid()) then
    raise exception 'not your board' using errcode = '42501';
  end if;
  select can_edit into v_can_edit from public.board_share_links where board_id = p_board_id;
  delete from public.board_share_links where board_id = p_board_id;
  insert into public.board_share_links (board_id, created_by, can_edit)
    values (p_board_id, auth.uid(), coalesce(v_can_edit, true)) returning token into v_token;
  return v_token;
end;
$$;


--
-- Name: set_board_share(uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_board_share(p_board_id uuid, p_can_edit boolean) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_token text;
begin
  if not exists (select 1 from public.boards b where b.id = p_board_id and b.user_id = auth.uid()) then
    raise exception 'not your board' using errcode = '42501';
  end if;
  select token into v_token from public.board_share_links where board_id = p_board_id;
  if v_token is null then
    insert into public.board_share_links (board_id, created_by, can_edit)
      values (p_board_id, auth.uid(), p_can_edit) returning token into v_token;
  else
    update public.board_share_links set can_edit = p_can_edit where board_id = p_board_id;
  end if;
  return v_token;
end;
$$;


--
-- Name: set_chat_message_pinned(uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_chat_message_pinned(p_message_id uuid, p_pinned boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  update public.board_chat_messages
     set pinned    = p_pinned,
         pinned_at = case when p_pinned then now()        else null end,
         pinned_by = case when p_pinned then auth.uid()   else null end
   where id = p_message_id;
end;
$$;


--
-- Name: set_collaborator_can_edit(uuid, uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_collaborator_can_edit(p_board_id uuid, p_user_id uuid, p_can_edit boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if not exists (select 1 from public.boards b where b.id = p_board_id and b.user_id = auth.uid()) then
    raise exception 'not your board' using errcode = '42501';
  end if;
  update public.board_collaborators set can_edit = p_can_edit
    where board_id = p_board_id and user_id = p_user_id;
end;
$$;


--
-- Name: set_contribution_approved(uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_contribution_approved(p_id uuid, p_approved boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_board uuid;
begin
  select board_id into v_board from public.board_item_contributions where id = p_id;
  if v_board is null then return; end if;
  if not public.can_moderate_board(v_board) then
    raise exception 'not authorized to moderate this board';
  end if;
  update public.board_item_contributions set approved = p_approved where id = p_id;
end;
$$;


--
-- Name: set_contribution_pinned(uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_contribution_pinned(p_id uuid, p_pinned boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_board uuid;
begin
  select board_id into v_board from public.board_item_contributions where id = p_id;
  if v_board is null then return; end if;
  if not public.can_moderate_board(v_board) then
    raise exception 'not authorized to moderate this board';
  end if;
  update public.board_item_contributions set pinned = p_pinned where id = p_id;
end;
$$;


--
-- Name: set_username(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_username(p_username text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare v_clean text := lower(trim(p_username));
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if v_clean !~ '^[a-z0-9_]{3,20}$' then raise exception 'invalid username'; end if;
  if exists (select 1 from public.profiles where lower(username) = v_clean and id <> auth.uid()) then
    raise exception 'username taken';
  end if;
  update public.profiles set username = v_clean, updated_at = now() where id = auth.uid();
  return v_clean;
end;
$_$;


--
-- Name: sync_community_board_likes(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_community_board_likes() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.community_boards SET likes = likes + 1 WHERE id = NEW.board_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.community_boards SET likes = GREATEST(0, likes - 1) WHERE id = OLD.board_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;


--
-- Name: sync_community_board_ratings(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_community_board_ratings() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.community_boards
      SET rating_sum = rating_sum + NEW.rating, rating_count = rating_count + 1
      WHERE id = NEW.board_id;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE public.community_boards
      SET rating_sum = rating_sum - OLD.rating + NEW.rating
      WHERE id = NEW.board_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.community_boards
      SET rating_sum = GREATEST(0, rating_sum - OLD.rating), rating_count = GREATEST(0, rating_count - 1)
      WHERE id = OLD.board_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;


--
-- Name: sync_community_board_uses(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_community_board_uses() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.community_boards SET uses = uses + 1 WHERE id = NEW.board_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.community_boards SET uses = GREATEST(0, uses - 1) WHERE id = OLD.board_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;


--
-- Name: toggle_community_board_like(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.toggle_community_board_like(p_board_id uuid) RETURNS TABLE(liked boolean, likes integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_user UUID := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM community_board_likes l WHERE l.board_id = p_board_id AND l.user_id = v_user) THEN
    DELETE FROM community_board_likes l WHERE l.board_id = p_board_id AND l.user_id = v_user;
    RETURN QUERY SELECT false, b.likes FROM community_boards b WHERE b.id = p_board_id;
  ELSE
    INSERT INTO community_board_likes (board_id, user_id) VALUES (p_board_id, v_user);
    RETURN QUERY SELECT true, b.likes FROM community_boards b WHERE b.id = p_board_id;
  END IF;
END;
$$;


--
-- Name: track_community_board_use(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.track_community_board_use(p_board_id uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_user UUID := auth.uid();
  v_uses INT;
BEGIN
  IF v_user IS NOT NULL THEN
    INSERT INTO community_board_uses (board_id, user_id)
    VALUES (p_board_id, v_user)
    ON CONFLICT (board_id, user_id) DO NOTHING;
  END IF;
  SELECT uses INTO v_uses FROM community_boards WHERE id = p_board_id;
  RETURN COALESCE(v_uses, 0);
END;
$$;


--
-- Name: update_boards_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_boards_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_server_member_count(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_server_member_count() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if TG_OP = 'INSERT' then
    update public.servers set member_count = member_count + 1, updated_at = now()
    where id = NEW.server_id;
  elsif TG_OP = 'DELETE' then
    update public.servers set member_count = greatest(member_count - 1, 0), updated_at = now()
    where id = OLD.server_id;
  end if;
  return null;
end;
$$;


--
-- Name: username_available(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.username_available(p_username text) RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select not exists (
    select 1 from public.profiles
    where lower(username) = lower(trim(p_username)) and id <> auth.uid()
  );
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: animation_presets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.animation_presets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_id uuid NOT NULL,
    server_id uuid,
    name text DEFAULT 'Animation'::text NOT NULL,
    spec jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: block_archives; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.block_archives (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    board_id uuid NOT NULL,
    box_id text NOT NULL,
    user_id uuid,
    title text DEFAULT ''::text NOT NULL,
    period_start timestamp with time zone,
    period_end timestamp with time zone,
    kind text DEFAULT 'auto'::text NOT NULL,
    pinned boolean DEFAULT false NOT NULL,
    data jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT block_archives_kind_check CHECK ((kind = ANY (ARRAY['auto'::text, 'manual'::text])))
);


--
-- Name: board_chat_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.board_chat_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    item_id text NOT NULL,
    board_id uuid NOT NULL,
    author_id uuid NOT NULL,
    author_name text DEFAULT ''::text NOT NULL,
    author_avatar text DEFAULT ''::text NOT NULL,
    content text DEFAULT ''::text NOT NULL,
    gif_url text,
    image_url text,
    file_name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    channel text DEFAULT 'general'::text NOT NULL,
    pinned boolean DEFAULT false NOT NULL,
    pinned_at timestamp with time zone,
    pinned_by uuid,
    edited_at timestamp with time zone,
    reply_to_id text,
    reply_to_author text,
    reply_to_text text
);


--
-- Name: board_chat_reactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.board_chat_reactions (
    message_id uuid NOT NULL,
    board_id uuid NOT NULL,
    user_id uuid NOT NULL,
    emoji text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.board_chat_reactions REPLICA IDENTITY FULL;


--
-- Name: board_collaborators; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.board_collaborators (
    board_id uuid NOT NULL,
    user_id uuid NOT NULL,
    can_edit boolean DEFAULT true NOT NULL,
    added_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: board_item_contributions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.board_item_contributions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    board_id uuid NOT NULL,
    item_id text NOT NULL,
    author_id uuid NOT NULL,
    author_name text DEFAULT ''::text NOT NULL,
    kind text DEFAULT 'entry'::text NOT NULL,
    content text DEFAULT ''::text NOT NULL,
    approved boolean DEFAULT true NOT NULL,
    pinned boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: board_share_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.board_share_links (
    token text DEFAULT "substring"(replace((gen_random_uuid())::text, '-'::text, ''::text), 1, 16) NOT NULL,
    board_id uuid NOT NULL,
    created_by uuid NOT NULL,
    can_edit boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: boards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.boards (
    id uuid NOT NULL,
    user_id uuid,
    server_id uuid,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT boards_exactly_one_owner CHECK ((num_nonnulls(user_id, server_id) = 1))
);


--
-- Name: calendar_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calendar_subscriptions (
    token text DEFAULT "substring"(replace((gen_random_uuid())::text, '-'::text, ''::text), 1, 32) NOT NULL,
    board_id uuid NOT NULL,
    item_id text NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: chat_notification_prefs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_notification_prefs (
    user_id uuid NOT NULL,
    chat_key text NOT NULL,
    level text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chat_notification_prefs_level_check CHECK ((level = ANY (ARRAY['all'::text, 'mentions'::text, 'mute'::text])))
);


--
-- Name: community_board_likes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.community_board_likes (
    board_id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: community_board_ratings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.community_board_ratings (
    board_id uuid NOT NULL,
    user_id uuid NOT NULL,
    rating integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT community_board_ratings_rating_check CHECK (((rating >= 1) AND (rating <= 5)))
);


--
-- Name: community_board_uses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.community_board_uses (
    board_id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: community_boards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.community_boards (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    kind text DEFAULT 'board'::text NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    category text DEFAULT 'other'::text NOT NULL,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    author_id uuid NOT NULL,
    author_name text DEFAULT 'Anonymous'::text NOT NULL,
    author_avatar text,
    preview_url text,
    board_data jsonb NOT NULL,
    likes integer DEFAULT 0 NOT NULL,
    uses integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    preview_images text[] DEFAULT '{}'::text[] NOT NULL,
    rating_sum integer DEFAULT 0 NOT NULL,
    rating_count integer DEFAULT 0 NOT NULL,
    CONSTRAINT community_boards_board_data_check CHECK ((pg_column_size(board_data) <= 1048576)),
    CONSTRAINT community_boards_category_check CHECK ((category = ANY (ARRAY['productivity'::text, 'fitness'::text, 'adhd'::text, 'gaming'::text, 'creative'::text, 'other'::text]))),
    CONSTRAINT community_boards_description_check CHECK ((char_length(description) <= 280)),
    CONSTRAINT community_boards_kind_check CHECK ((kind = ANY (ARRAY['board'::text, 'box'::text, 'item'::text]))),
    CONSTRAINT community_boards_name_check CHECK (((char_length(name) >= 1) AND (char_length(name) <= 60))),
    CONSTRAINT community_boards_preview_images_len CHECK (((array_length(preview_images, 1) IS NULL) OR (array_length(preview_images, 1) <= 6))),
    CONSTRAINT community_boards_tags_check CHECK (((array_length(tags, 1) IS NULL) OR (array_length(tags, 1) <= 5)))
);


--
-- Name: dm_conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dm_conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_a uuid NOT NULL,
    user_b uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT dm_conversations_ordered CHECK ((user_a < user_b))
);


--
-- Name: dm_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dm_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    author_id uuid NOT NULL,
    content text DEFAULT ''::text NOT NULL,
    gif_url text,
    image_url text,
    file_name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: file_bank_files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.file_bank_files (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    item_id text NOT NULL,
    board_id text NOT NULL,
    name text NOT NULL,
    size_bytes bigint DEFAULT 0 NOT NULL,
    mime_type text DEFAULT ''::text NOT NULL,
    uploaded_by text DEFAULT ''::text NOT NULL,
    uploaded_at timestamp with time zone DEFAULT now() NOT NULL,
    url text
);


--
-- Name: friendships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.friendships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    requester_id uuid NOT NULL,
    addressee_id uuid NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT friendships_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text]))),
    CONSTRAINT no_self_friend CHECK ((requester_id <> addressee_id))
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    display_name text DEFAULT 'Anonymous'::text NOT NULL,
    avatar_url text,
    banner_url text,
    color text DEFAULT '#d59ee8'::text NOT NULL,
    pronouns text,
    status text,
    status_emoji text,
    favorite_board_id text,
    profile_board jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    theme_vars jsonb,
    app_font text DEFAULT 'Inter'::text,
    app_bg jsonb,
    username text,
    allow_dms_from text DEFAULT 'everyone'::text NOT NULL,
    allow_friend_requests boolean DEFAULT true NOT NULL,
    CONSTRAINT profiles_allow_dms_from_check CHECK ((allow_dms_from = ANY (ARRAY['everyone'::text, 'friends'::text, 'none'::text])))
);


--
-- Name: push_chat_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.push_chat_log (
    user_id uuid NOT NULL,
    chat_key text NOT NULL,
    sent_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: push_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.push_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    endpoint text NOT NULL,
    p256dh text NOT NULL,
    auth text NOT NULL,
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: reminders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reminders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title text DEFAULT ''::text NOT NULL,
    body text DEFAULT ''::text NOT NULL,
    remind_at timestamp with time zone NOT NULL,
    channel text DEFAULT 'email'::text NOT NULL,
    board_id uuid,
    item_id text,
    url text,
    status text DEFAULT 'pending'::text NOT NULL,
    sent_at timestamp with time zone,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: server_audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.server_audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    server_id uuid NOT NULL,
    user_id uuid,
    username text DEFAULT 'Unknown'::text NOT NULL,
    action text NOT NULL,
    details jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: server_backups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.server_backups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    server_id uuid NOT NULL,
    slot integer NOT NULL,
    label text,
    snapshot jsonb NOT NULL,
    created_by uuid,
    creator_name text DEFAULT 'Unknown'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT server_backups_slot_check CHECK (((slot >= 1) AND (slot <= 3)))
);


--
-- Name: server_bots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.server_bots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    server_id uuid NOT NULL,
    name text NOT NULL,
    avatar text,
    token_hash text NOT NULL,
    permissions text[] DEFAULT '{}'::text[] NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_used_at timestamp with time zone,
    CONSTRAINT server_bots_name_check CHECK (((char_length(name) >= 1) AND (char_length(name) <= 40)))
);


--
-- Name: server_invites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.server_invites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    server_id uuid NOT NULL,
    created_by uuid NOT NULL,
    code text DEFAULT "substring"(replace((gen_random_uuid())::text, '-'::text, ''::text), 1, 8) NOT NULL,
    expires_at timestamp with time zone,
    max_uses integer,
    uses_count integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: server_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.server_members (
    server_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text DEFAULT 'member'::text NOT NULL,
    joined_at timestamp with time zone DEFAULT now() NOT NULL,
    role_ids text[] DEFAULT '{}'::text[] NOT NULL,
    CONSTRAINT server_members_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'admin'::text, 'member'::text])))
);


--
-- Name: server_publishes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.server_publishes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    server_id uuid NOT NULL,
    snapshot jsonb NOT NULL,
    message text,
    published_by uuid,
    publisher_name text DEFAULT 'Unknown'::text NOT NULL,
    published_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: servers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.servers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    icon text DEFAULT '🌐'::text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    owner_id uuid NOT NULL,
    board_id uuid DEFAULT gen_random_uuid() NOT NULL,
    is_public boolean DEFAULT false NOT NULL,
    member_count integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    activity_channel text DEFAULT 'general'::text NOT NULL,
    roles jsonb DEFAULT '[]'::jsonb NOT NULL
);


--
-- Name: user_integrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_integrations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    provider text NOT NULL,
    api_key text NOT NULL,
    meta jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: webhook_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webhook_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    board_id text NOT NULL,
    item_data jsonb NOT NULL,
    consumed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: webhook_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webhook_tokens (
    token text NOT NULL,
    board_id text NOT NULL,
    server_id text,
    label text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: animation_presets animation_presets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.animation_presets
    ADD CONSTRAINT animation_presets_pkey PRIMARY KEY (id);


--
-- Name: block_archives block_archives_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.block_archives
    ADD CONSTRAINT block_archives_pkey PRIMARY KEY (id);


--
-- Name: board_chat_messages board_chat_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.board_chat_messages
    ADD CONSTRAINT board_chat_messages_pkey PRIMARY KEY (id);


--
-- Name: board_chat_reactions board_chat_reactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.board_chat_reactions
    ADD CONSTRAINT board_chat_reactions_pkey PRIMARY KEY (message_id, user_id, emoji);


--
-- Name: board_collaborators board_collaborators_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.board_collaborators
    ADD CONSTRAINT board_collaborators_pkey PRIMARY KEY (board_id, user_id);


--
-- Name: board_item_contributions board_item_contributions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.board_item_contributions
    ADD CONSTRAINT board_item_contributions_pkey PRIMARY KEY (id);


--
-- Name: board_share_links board_share_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.board_share_links
    ADD CONSTRAINT board_share_links_pkey PRIMARY KEY (token);


--
-- Name: boards boards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.boards
    ADD CONSTRAINT boards_pkey PRIMARY KEY (id);


--
-- Name: calendar_subscriptions calendar_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_subscriptions
    ADD CONSTRAINT calendar_subscriptions_pkey PRIMARY KEY (token);


--
-- Name: chat_notification_prefs chat_notification_prefs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_notification_prefs
    ADD CONSTRAINT chat_notification_prefs_pkey PRIMARY KEY (user_id, chat_key);


--
-- Name: community_board_likes community_board_likes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_board_likes
    ADD CONSTRAINT community_board_likes_pkey PRIMARY KEY (board_id, user_id);


--
-- Name: community_board_ratings community_board_ratings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_board_ratings
    ADD CONSTRAINT community_board_ratings_pkey PRIMARY KEY (board_id, user_id);


--
-- Name: community_board_uses community_board_uses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_board_uses
    ADD CONSTRAINT community_board_uses_pkey PRIMARY KEY (board_id, user_id);


--
-- Name: community_boards community_boards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_boards
    ADD CONSTRAINT community_boards_pkey PRIMARY KEY (id);


--
-- Name: dm_conversations dm_conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dm_conversations
    ADD CONSTRAINT dm_conversations_pkey PRIMARY KEY (id);


--
-- Name: dm_conversations dm_conversations_user_a_user_b_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dm_conversations
    ADD CONSTRAINT dm_conversations_user_a_user_b_key UNIQUE (user_a, user_b);


--
-- Name: dm_messages dm_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dm_messages
    ADD CONSTRAINT dm_messages_pkey PRIMARY KEY (id);


--
-- Name: file_bank_files file_bank_files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_bank_files
    ADD CONSTRAINT file_bank_files_pkey PRIMARY KEY (id);


--
-- Name: friendships friendships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friendships
    ADD CONSTRAINT friendships_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: push_chat_log push_chat_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_chat_log
    ADD CONSTRAINT push_chat_log_pkey PRIMARY KEY (user_id, chat_key);


--
-- Name: push_subscriptions push_subscriptions_endpoint_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_endpoint_key UNIQUE (endpoint);


--
-- Name: push_subscriptions push_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: reminders reminders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminders
    ADD CONSTRAINT reminders_pkey PRIMARY KEY (id);


--
-- Name: server_audit_logs server_audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.server_audit_logs
    ADD CONSTRAINT server_audit_logs_pkey PRIMARY KEY (id);


--
-- Name: server_backups server_backups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.server_backups
    ADD CONSTRAINT server_backups_pkey PRIMARY KEY (id);


--
-- Name: server_backups server_backups_server_id_slot_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.server_backups
    ADD CONSTRAINT server_backups_server_id_slot_key UNIQUE (server_id, slot);


--
-- Name: server_bots server_bots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.server_bots
    ADD CONSTRAINT server_bots_pkey PRIMARY KEY (id);


--
-- Name: server_bots server_bots_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.server_bots
    ADD CONSTRAINT server_bots_token_hash_key UNIQUE (token_hash);


--
-- Name: server_invites server_invites_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.server_invites
    ADD CONSTRAINT server_invites_code_key UNIQUE (code);


--
-- Name: server_invites server_invites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.server_invites
    ADD CONSTRAINT server_invites_pkey PRIMARY KEY (id);


--
-- Name: server_members server_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.server_members
    ADD CONSTRAINT server_members_pkey PRIMARY KEY (server_id, user_id);


--
-- Name: server_publishes server_publishes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.server_publishes
    ADD CONSTRAINT server_publishes_pkey PRIMARY KEY (id);


--
-- Name: servers servers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.servers
    ADD CONSTRAINT servers_pkey PRIMARY KEY (id);


--
-- Name: user_integrations user_integrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_integrations
    ADD CONSTRAINT user_integrations_pkey PRIMARY KEY (id);


--
-- Name: user_integrations user_integrations_user_id_provider_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_integrations
    ADD CONSTRAINT user_integrations_user_id_provider_key UNIQUE (user_id, provider);


--
-- Name: webhook_items webhook_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_items
    ADD CONSTRAINT webhook_items_pkey PRIMARY KEY (id);


--
-- Name: webhook_tokens webhook_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_tokens
    ADD CONSTRAINT webhook_tokens_pkey PRIMARY KEY (token);


--
-- Name: animation_presets_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX animation_presets_owner ON public.animation_presets USING btree (owner_id, created_at DESC);


--
-- Name: animation_presets_server; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX animation_presets_server ON public.animation_presets USING btree (server_id, created_at DESC);


--
-- Name: block_archives_auto_boundary_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX block_archives_auto_boundary_idx ON public.block_archives USING btree (box_id, period_end) WHERE (kind = 'auto'::text);


--
-- Name: block_archives_board_box_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX block_archives_board_box_idx ON public.block_archives USING btree (board_id, box_id, created_at DESC);


--
-- Name: board_chat_messages_channel_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX board_chat_messages_channel_idx ON public.board_chat_messages USING btree (board_id, channel, created_at);


--
-- Name: board_chat_messages_item_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX board_chat_messages_item_created ON public.board_chat_messages USING btree (item_id, created_at);


--
-- Name: board_chat_messages_pinned_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX board_chat_messages_pinned_idx ON public.board_chat_messages USING btree (board_id, channel, pinned_at DESC) WHERE pinned;


--
-- Name: board_chat_reactions_message_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX board_chat_reactions_message_idx ON public.board_chat_reactions USING btree (message_id);


--
-- Name: board_item_contributions_item_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX board_item_contributions_item_idx ON public.board_item_contributions USING btree (item_id, created_at);


--
-- Name: board_item_contributions_one_upvote_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX board_item_contributions_one_upvote_idx ON public.board_item_contributions USING btree (item_id, author_id, content) WHERE (kind = 'upvote'::text);


--
-- Name: board_item_contributions_one_vote_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX board_item_contributions_one_vote_idx ON public.board_item_contributions USING btree (item_id, author_id) WHERE (kind = 'vote'::text);


--
-- Name: board_share_links_board_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX board_share_links_board_idx ON public.board_share_links USING btree (board_id);


--
-- Name: calendar_subscriptions_board_item_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX calendar_subscriptions_board_item_idx ON public.calendar_subscriptions USING btree (board_id, item_id);


--
-- Name: community_boards_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX community_boards_category ON public.community_boards USING btree (category, created_at DESC);


--
-- Name: community_boards_most_liked; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX community_boards_most_liked ON public.community_boards USING btree (likes DESC);


--
-- Name: community_boards_most_used; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX community_boards_most_used ON public.community_boards USING btree (uses DESC);


--
-- Name: community_boards_newest; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX community_boards_newest ON public.community_boards USING btree (created_at DESC);


--
-- Name: dm_messages_conversation_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dm_messages_conversation_created ON public.dm_messages USING btree (conversation_id, created_at);


--
-- Name: file_bank_files_item; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX file_bank_files_item ON public.file_bank_files USING btree (item_id, uploaded_at);


--
-- Name: friendships_addressee; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX friendships_addressee ON public.friendships USING btree (addressee_id, status);


--
-- Name: friendships_requester; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX friendships_requester ON public.friendships USING btree (requester_id, status);


--
-- Name: friendships_unique_pair; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX friendships_unique_pair ON public.friendships USING btree (LEAST((requester_id)::text, (addressee_id)::text), GREATEST((requester_id)::text, (addressee_id)::text));


--
-- Name: profiles_username_lower_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX profiles_username_lower_key ON public.profiles USING btree (lower(username));


--
-- Name: push_subscriptions_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX push_subscriptions_user_idx ON public.push_subscriptions USING btree (user_id);


--
-- Name: reminders_due_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reminders_due_idx ON public.reminders USING btree (remind_at) WHERE (status = 'pending'::text);


--
-- Name: server_audit_logs_server_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX server_audit_logs_server_created_idx ON public.server_audit_logs USING btree (server_id, created_at DESC);


--
-- Name: server_bots_server; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX server_bots_server ON public.server_bots USING btree (server_id);


--
-- Name: server_publishes_server_published_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX server_publishes_server_published_idx ON public.server_publishes USING btree (server_id, published_at DESC);


--
-- Name: user_integrations_user_provider; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_integrations_user_provider ON public.user_integrations USING btree (user_id, provider);


--
-- Name: webhook_items_board_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX webhook_items_board_id_idx ON public.webhook_items USING btree (board_id, consumed_at);


--
-- Name: board_chat_messages board_chat_push_webhook; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER board_chat_push_webhook AFTER INSERT ON public.board_chat_messages FOR EACH ROW EXECUTE FUNCTION supabase_functions.http_request('https://crecoard.com/api/push/chat', 'POST', '{"Content-Type":"application/json"}', '{}', '5000');


--
-- Name: boards boards_guard_owner; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER boards_guard_owner BEFORE UPDATE ON public.boards FOR EACH ROW EXECUTE FUNCTION public.boards_guard_owner();


--
-- Name: boards boards_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER boards_updated_at BEFORE UPDATE ON public.boards FOR EACH ROW EXECUTE FUNCTION public.update_boards_updated_at();


--
-- Name: community_board_likes community_board_likes_sync; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER community_board_likes_sync AFTER INSERT OR DELETE ON public.community_board_likes FOR EACH ROW EXECUTE FUNCTION public.sync_community_board_likes();


--
-- Name: community_board_ratings community_board_ratings_sync; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER community_board_ratings_sync AFTER INSERT OR DELETE OR UPDATE ON public.community_board_ratings FOR EACH ROW EXECUTE FUNCTION public.sync_community_board_ratings();


--
-- Name: community_board_uses community_board_uses_sync; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER community_board_uses_sync AFTER INSERT OR DELETE ON public.community_board_uses FOR EACH ROW EXECUTE FUNCTION public.sync_community_board_uses();


--
-- Name: board_item_contributions contrib_guard_moderation_fields; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER contrib_guard_moderation_fields BEFORE UPDATE ON public.board_item_contributions FOR EACH ROW EXECUTE FUNCTION public.contrib_guard_moderation_fields();


--
-- Name: servers on_server_created; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_server_created AFTER INSERT ON public.servers FOR EACH ROW EXECUTE FUNCTION public.handle_new_server();


--
-- Name: server_members on_server_member_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_server_member_change AFTER INSERT OR DELETE ON public.server_members FOR EACH ROW EXECUTE FUNCTION public.update_server_member_count();


--
-- Name: animation_presets animation_presets_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.animation_presets
    ADD CONSTRAINT animation_presets_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: animation_presets animation_presets_server_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.animation_presets
    ADD CONSTRAINT animation_presets_server_id_fkey FOREIGN KEY (server_id) REFERENCES public.servers(id) ON DELETE CASCADE;


--
-- Name: block_archives block_archives_board_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.block_archives
    ADD CONSTRAINT block_archives_board_id_fkey FOREIGN KEY (board_id) REFERENCES public.boards(id) ON DELETE CASCADE;


--
-- Name: block_archives block_archives_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.block_archives
    ADD CONSTRAINT block_archives_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: board_chat_messages board_chat_messages_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.board_chat_messages
    ADD CONSTRAINT board_chat_messages_author_id_fkey FOREIGN KEY (author_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: board_chat_messages board_chat_messages_pinned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.board_chat_messages
    ADD CONSTRAINT board_chat_messages_pinned_by_fkey FOREIGN KEY (pinned_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: board_chat_reactions board_chat_reactions_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.board_chat_reactions
    ADD CONSTRAINT board_chat_reactions_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.board_chat_messages(id) ON DELETE CASCADE;


--
-- Name: board_chat_reactions board_chat_reactions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.board_chat_reactions
    ADD CONSTRAINT board_chat_reactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: board_collaborators board_collaborators_board_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.board_collaborators
    ADD CONSTRAINT board_collaborators_board_id_fkey FOREIGN KEY (board_id) REFERENCES public.boards(id) ON DELETE CASCADE;


--
-- Name: board_collaborators board_collaborators_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.board_collaborators
    ADD CONSTRAINT board_collaborators_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: board_item_contributions board_item_contributions_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.board_item_contributions
    ADD CONSTRAINT board_item_contributions_author_id_fkey FOREIGN KEY (author_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: board_share_links board_share_links_board_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.board_share_links
    ADD CONSTRAINT board_share_links_board_id_fkey FOREIGN KEY (board_id) REFERENCES public.boards(id) ON DELETE CASCADE;


--
-- Name: board_share_links board_share_links_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.board_share_links
    ADD CONSTRAINT board_share_links_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: boards boards_server_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.boards
    ADD CONSTRAINT boards_server_id_fkey FOREIGN KEY (server_id) REFERENCES public.servers(id) ON DELETE CASCADE;


--
-- Name: boards boards_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.boards
    ADD CONSTRAINT boards_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: calendar_subscriptions calendar_subscriptions_board_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_subscriptions
    ADD CONSTRAINT calendar_subscriptions_board_id_fkey FOREIGN KEY (board_id) REFERENCES public.boards(id) ON DELETE CASCADE;


--
-- Name: calendar_subscriptions calendar_subscriptions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_subscriptions
    ADD CONSTRAINT calendar_subscriptions_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: chat_notification_prefs chat_notification_prefs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_notification_prefs
    ADD CONSTRAINT chat_notification_prefs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: community_board_likes community_board_likes_board_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_board_likes
    ADD CONSTRAINT community_board_likes_board_id_fkey FOREIGN KEY (board_id) REFERENCES public.community_boards(id) ON DELETE CASCADE;


--
-- Name: community_board_likes community_board_likes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_board_likes
    ADD CONSTRAINT community_board_likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: community_board_ratings community_board_ratings_board_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_board_ratings
    ADD CONSTRAINT community_board_ratings_board_id_fkey FOREIGN KEY (board_id) REFERENCES public.community_boards(id) ON DELETE CASCADE;


--
-- Name: community_board_ratings community_board_ratings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_board_ratings
    ADD CONSTRAINT community_board_ratings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: community_board_uses community_board_uses_board_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_board_uses
    ADD CONSTRAINT community_board_uses_board_id_fkey FOREIGN KEY (board_id) REFERENCES public.community_boards(id) ON DELETE CASCADE;


--
-- Name: community_board_uses community_board_uses_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_board_uses
    ADD CONSTRAINT community_board_uses_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: community_boards community_boards_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_boards
    ADD CONSTRAINT community_boards_author_id_fkey FOREIGN KEY (author_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: dm_conversations dm_conversations_user_a_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dm_conversations
    ADD CONSTRAINT dm_conversations_user_a_fkey FOREIGN KEY (user_a) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: dm_conversations dm_conversations_user_b_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dm_conversations
    ADD CONSTRAINT dm_conversations_user_b_fkey FOREIGN KEY (user_b) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: dm_messages dm_messages_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dm_messages
    ADD CONSTRAINT dm_messages_author_id_fkey FOREIGN KEY (author_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: dm_messages dm_messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dm_messages
    ADD CONSTRAINT dm_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.dm_conversations(id) ON DELETE CASCADE;


--
-- Name: friendships friendships_addressee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friendships
    ADD CONSTRAINT friendships_addressee_id_fkey FOREIGN KEY (addressee_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: friendships friendships_requester_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friendships
    ADD CONSTRAINT friendships_requester_id_fkey FOREIGN KEY (requester_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: push_subscriptions push_subscriptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: reminders reminders_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminders
    ADD CONSTRAINT reminders_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: server_audit_logs server_audit_logs_server_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.server_audit_logs
    ADD CONSTRAINT server_audit_logs_server_id_fkey FOREIGN KEY (server_id) REFERENCES public.servers(id) ON DELETE CASCADE;


--
-- Name: server_audit_logs server_audit_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.server_audit_logs
    ADD CONSTRAINT server_audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: server_bots server_bots_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.server_bots
    ADD CONSTRAINT server_bots_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: server_bots server_bots_server_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.server_bots
    ADD CONSTRAINT server_bots_server_id_fkey FOREIGN KEY (server_id) REFERENCES public.servers(id) ON DELETE CASCADE;


--
-- Name: server_invites server_invites_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.server_invites
    ADD CONSTRAINT server_invites_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: server_invites server_invites_server_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.server_invites
    ADD CONSTRAINT server_invites_server_id_fkey FOREIGN KEY (server_id) REFERENCES public.servers(id) ON DELETE CASCADE;


--
-- Name: server_members server_members_server_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.server_members
    ADD CONSTRAINT server_members_server_id_fkey FOREIGN KEY (server_id) REFERENCES public.servers(id) ON DELETE CASCADE;


--
-- Name: server_members server_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.server_members
    ADD CONSTRAINT server_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: server_publishes server_publishes_published_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.server_publishes
    ADD CONSTRAINT server_publishes_published_by_fkey FOREIGN KEY (published_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: server_publishes server_publishes_server_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.server_publishes
    ADD CONSTRAINT server_publishes_server_id_fkey FOREIGN KEY (server_id) REFERENCES public.servers(id) ON DELETE CASCADE;


--
-- Name: servers servers_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.servers
    ADD CONSTRAINT servers_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id);


--
-- Name: user_integrations user_integrations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_integrations
    ADD CONSTRAINT user_integrations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: server_publishes Admins can insert publishes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert publishes" ON public.server_publishes FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.server_members
  WHERE ((server_members.server_id = server_publishes.server_id) AND (server_members.user_id = auth.uid()) AND (server_members.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));


--
-- Name: servers Authenticated users can create servers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can create servers" ON public.servers FOR INSERT WITH CHECK ((auth.uid() = owner_id));


--
-- Name: server_invites Invite creator can delete invite; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Invite creator can delete invite" ON public.server_invites FOR DELETE USING ((created_by = auth.uid()));


--
-- Name: server_invites Members can create invites for their servers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can create invites for their servers" ON public.server_invites FOR INSERT WITH CHECK (((auth.uid() = created_by) AND (EXISTS ( SELECT 1
   FROM public.server_members
  WHERE ((server_members.server_id = server_invites.server_id) AND (server_members.user_id = auth.uid()))))));


--
-- Name: server_audit_logs Members can insert audit entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can insert audit entries" ON public.server_audit_logs FOR INSERT WITH CHECK (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.server_members
  WHERE ((server_members.server_id = server_audit_logs.server_id) AND (server_members.user_id = auth.uid()))))));


--
-- Name: server_members Members can leave, admins can remove others; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can leave, admins can remove others" ON public.server_members FOR DELETE USING (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.server_members sm2
  WHERE ((sm2.server_id = server_members.server_id) AND (sm2.user_id = auth.uid()) AND (sm2.role = ANY (ARRAY['owner'::text, 'admin'::text])))))));


--
-- Name: server_members Members can view all members of shared servers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can view all members of shared servers" ON public.server_members FOR SELECT TO authenticated USING (public.is_member_of_server(server_id));


--
-- Name: server_audit_logs Members can view audit log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can view audit log" ON public.server_audit_logs FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.server_members
  WHERE ((server_members.server_id = server_audit_logs.server_id) AND (server_members.user_id = auth.uid())))));


--
-- Name: server_publishes Members can view publishes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can view publishes" ON public.server_publishes FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.server_members
  WHERE ((server_members.server_id = server_publishes.server_id) AND (server_members.user_id = auth.uid())))));


--
-- Name: server_invites Members can view their server's invites; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Members can view their server's invites" ON public.server_invites FOR SELECT USING (((created_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.server_members
  WHERE ((server_members.server_id = server_invites.server_id) AND (server_members.user_id = auth.uid()))))));


--
-- Name: server_members Owners and admins can change roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners and admins can change roles" ON public.server_members FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.server_members sm2
  WHERE ((sm2.server_id = server_members.server_id) AND (sm2.user_id = auth.uid()) AND (sm2.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));


--
-- Name: servers Owners and admins can update server; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners and admins can update server" ON public.servers FOR UPDATE USING (((owner_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.server_members
  WHERE ((server_members.server_id = servers.id) AND (server_members.user_id = auth.uid()) AND (server_members.role = 'admin'::text))))));


--
-- Name: servers Owners can delete server; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners can delete server" ON public.servers FOR DELETE USING ((owner_id = auth.uid()));


--
-- Name: profiles Profiles are viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);


--
-- Name: servers Servers visible to members and public; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Servers visible to members and public" ON public.servers FOR SELECT USING (((is_public = true) OR (owner_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.server_members
  WHERE ((server_members.server_id = servers.id) AND (server_members.user_id = auth.uid()))))));


--
-- Name: profiles Users can insert their own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK ((auth.uid() = id));


--
-- Name: profiles Users can update their own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING ((auth.uid() = id));


--
-- Name: animation_presets anim_presets_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY anim_presets_delete ON public.animation_presets FOR DELETE TO authenticated USING (((owner_id = auth.uid()) OR ((server_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.server_members m
  WHERE ((m.server_id = animation_presets.server_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['owner'::text, 'admin'::text]))))))));


--
-- Name: animation_presets anim_presets_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY anim_presets_insert ON public.animation_presets FOR INSERT TO authenticated WITH CHECK (((owner_id = auth.uid()) AND ((server_id IS NULL) OR public.is_member_of_server(server_id))));


--
-- Name: animation_presets anim_presets_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY anim_presets_read ON public.animation_presets FOR SELECT TO authenticated USING (((owner_id = auth.uid()) OR ((server_id IS NOT NULL) AND public.is_member_of_server(server_id))));


--
-- Name: animation_presets anim_presets_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY anim_presets_update ON public.animation_presets FOR UPDATE TO authenticated USING ((owner_id = auth.uid()));


--
-- Name: animation_presets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.animation_presets ENABLE ROW LEVEL SECURITY;

--
-- Name: dm_messages authors insert messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authors insert messages" ON public.dm_messages FOR INSERT TO authenticated WITH CHECK ((author_id = auth.uid()));


--
-- Name: block_archives; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.block_archives ENABLE ROW LEVEL SECURITY;

--
-- Name: block_archives board access delete archives; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "board access delete archives" ON public.block_archives FOR DELETE TO authenticated USING (public.can_access_board(board_id));


--
-- Name: block_archives board access insert archives; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "board access insert archives" ON public.block_archives FOR INSERT TO authenticated WITH CHECK ((public.can_access_board(board_id) AND (user_id = auth.uid())));


--
-- Name: block_archives board access read archives; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "board access read archives" ON public.block_archives FOR SELECT TO authenticated USING (public.can_access_board(board_id));


--
-- Name: block_archives board access update archives; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "board access update archives" ON public.block_archives FOR UPDATE TO authenticated USING (public.can_access_board(board_id));


--
-- Name: board_chat_messages board_chat_delete_moderator; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY board_chat_delete_moderator ON public.board_chat_messages FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.servers s
     JOIN public.server_members sm ON ((sm.server_id = s.id)))
  WHERE ((s.board_id = board_chat_messages.board_id) AND (sm.user_id = auth.uid()) AND (sm.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));


--
-- Name: board_chat_messages board_chat_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY board_chat_delete_own ON public.board_chat_messages FOR DELETE TO authenticated USING (((author_id = auth.uid()) AND public.can_access_board((board_id)::text)));


--
-- Name: board_chat_messages board_chat_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY board_chat_insert ON public.board_chat_messages FOR INSERT TO authenticated WITH CHECK (((author_id = auth.uid()) AND public.can_access_board((board_id)::text)));


--
-- Name: board_chat_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.board_chat_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: board_chat_reactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.board_chat_reactions ENABLE ROW LEVEL SECURITY;

--
-- Name: board_chat_reactions board_chat_reactions_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY board_chat_reactions_delete ON public.board_chat_reactions FOR DELETE TO authenticated USING (((user_id = auth.uid()) AND public.can_access_board((board_id)::text)));


--
-- Name: board_chat_reactions board_chat_reactions_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY board_chat_reactions_insert ON public.board_chat_reactions FOR INSERT TO authenticated WITH CHECK (((user_id = auth.uid()) AND public.can_access_board((board_id)::text)));


--
-- Name: board_chat_reactions board_chat_reactions_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY board_chat_reactions_read ON public.board_chat_reactions FOR SELECT TO authenticated USING (public.can_access_board((board_id)::text));


--
-- Name: board_chat_messages board_chat_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY board_chat_read ON public.board_chat_messages FOR SELECT TO authenticated USING (public.can_access_board((board_id)::text));


--
-- Name: board_chat_messages board_chat_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY board_chat_update_own ON public.board_chat_messages FOR UPDATE TO authenticated USING (((author_id = auth.uid()) AND public.can_access_board((board_id)::text))) WITH CHECK (((author_id = auth.uid()) AND public.can_access_board((board_id)::text)));


--
-- Name: board_collaborators; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.board_collaborators ENABLE ROW LEVEL SECURITY;

--
-- Name: board_item_contributions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.board_item_contributions ENABLE ROW LEVEL SECURITY;

--
-- Name: board_share_links; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.board_share_links ENABLE ROW LEVEL SECURITY;

--
-- Name: boards; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.boards ENABLE ROW LEVEL SECURITY;

--
-- Name: calendar_subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.calendar_subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_notification_prefs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chat_notification_prefs ENABLE ROW LEVEL SECURITY;

--
-- Name: boards collaborators read shared boards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "collaborators read shared boards" ON public.boards FOR SELECT TO authenticated USING (public.is_board_collaborator(id));


--
-- Name: community_board_likes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.community_board_likes ENABLE ROW LEVEL SECURITY;

--
-- Name: community_board_likes community_board_likes_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY community_board_likes_select ON public.community_board_likes FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: community_board_ratings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.community_board_ratings ENABLE ROW LEVEL SECURITY;

--
-- Name: community_board_ratings community_board_ratings_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY community_board_ratings_select ON public.community_board_ratings FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: community_board_uses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.community_board_uses ENABLE ROW LEVEL SECURITY;

--
-- Name: community_board_uses community_board_uses_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY community_board_uses_select ON public.community_board_uses FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: community_boards; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.community_boards ENABLE ROW LEVEL SECURITY;

--
-- Name: community_boards community_boards_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY community_boards_delete ON public.community_boards FOR DELETE TO authenticated USING ((author_id = auth.uid()));


--
-- Name: community_boards community_boards_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY community_boards_insert ON public.community_boards FOR INSERT TO authenticated WITH CHECK ((author_id = auth.uid()));


--
-- Name: community_boards community_boards_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY community_boards_select ON public.community_boards FOR SELECT TO authenticated, anon USING (true);


--
-- Name: board_item_contributions contrib_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY contrib_delete_own ON public.board_item_contributions FOR DELETE TO authenticated USING (((author_id = auth.uid()) AND public.can_access_board((board_id)::text)));


--
-- Name: board_item_contributions contrib_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY contrib_insert ON public.board_item_contributions FOR INSERT TO authenticated WITH CHECK (((author_id = auth.uid()) AND public.can_access_board((board_id)::text)));


--
-- Name: board_item_contributions contrib_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY contrib_read ON public.board_item_contributions FOR SELECT TO authenticated USING ((public.can_access_board((board_id)::text) AND (approved OR (author_id = auth.uid()) OR public.can_moderate_board(board_id))));


--
-- Name: board_item_contributions contrib_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY contrib_update_own ON public.board_item_contributions FOR UPDATE TO authenticated USING (((author_id = auth.uid()) AND public.can_access_board((board_id)::text))) WITH CHECK (((author_id = auth.uid()) AND public.can_access_board((board_id)::text)));


--
-- Name: dm_conversations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dm_conversations ENABLE ROW LEVEL SECURITY;

--
-- Name: dm_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dm_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: boards editors update shared boards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "editors update shared boards" ON public.boards FOR UPDATE TO authenticated USING (public.is_board_editor(id));


--
-- Name: file_bank_files file_bank_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY file_bank_delete ON public.file_bank_files FOR DELETE TO authenticated USING (public.can_moderate_board(public.board_uuid_of(board_id)));


--
-- Name: file_bank_files; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.file_bank_files ENABLE ROW LEVEL SECURITY;

--
-- Name: file_bank_files file_bank_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY file_bank_insert ON public.file_bank_files FOR INSERT TO authenticated WITH CHECK (public.can_access_board(board_id));


--
-- Name: file_bank_files file_bank_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY file_bank_read ON public.file_bank_files FOR SELECT TO authenticated USING (public.can_access_board(board_id));


--
-- Name: friendships; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

--
-- Name: friendships friendships_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY friendships_delete ON public.friendships FOR DELETE TO authenticated USING (((requester_id = auth.uid()) OR (addressee_id = auth.uid())));


--
-- Name: friendships friendships_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY friendships_insert ON public.friendships FOR INSERT TO authenticated WITH CHECK (((requester_id = auth.uid()) AND COALESCE(( SELECT profiles.allow_friend_requests
   FROM public.profiles
  WHERE (profiles.id = friendships.addressee_id)), true)));


--
-- Name: friendships friendships_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY friendships_select ON public.friendships FOR SELECT TO authenticated USING (((requester_id = auth.uid()) OR (addressee_id = auth.uid())));


--
-- Name: friendships friendships_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY friendships_update ON public.friendships FOR UPDATE TO authenticated USING ((addressee_id = auth.uid())) WITH CHECK ((status = 'accepted'::text));


--
-- Name: calendar_subscriptions moderator manages calendar subs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "moderator manages calendar subs" ON public.calendar_subscriptions TO authenticated USING (public.can_moderate_board(board_id)) WITH CHECK ((public.can_moderate_board(board_id) AND (created_by = auth.uid())));


--
-- Name: chat_notification_prefs own chat prefs delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own chat prefs delete" ON public.chat_notification_prefs FOR DELETE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: chat_notification_prefs own chat prefs insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own chat prefs insert" ON public.chat_notification_prefs FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: chat_notification_prefs own chat prefs read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own chat prefs read" ON public.chat_notification_prefs FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: chat_notification_prefs own chat prefs update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own chat prefs update" ON public.chat_notification_prefs FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: push_subscriptions own push subs delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own push subs delete" ON public.push_subscriptions FOR DELETE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: push_subscriptions own push subs insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own push subs insert" ON public.push_subscriptions FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: push_subscriptions own push subs read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own push subs read" ON public.push_subscriptions FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: push_subscriptions own push subs update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own push subs update" ON public.push_subscriptions FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: reminders own reminders delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own reminders delete" ON public.reminders FOR DELETE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: reminders own reminders insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own reminders insert" ON public.reminders FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: reminders own reminders read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own reminders read" ON public.reminders FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: reminders own reminders update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "own reminders update" ON public.reminders FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: board_share_links owner manages share links; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "owner manages share links" ON public.board_share_links TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.boards b
  WHERE ((b.id = board_share_links.board_id) AND (b.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.boards b
  WHERE ((b.id = board_share_links.board_id) AND (b.user_id = auth.uid())))));


--
-- Name: board_collaborators owner or self removes collaborator; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "owner or self removes collaborator" ON public.board_collaborators FOR DELETE TO authenticated USING (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.boards b
  WHERE ((b.id = board_collaborators.board_id) AND (b.user_id = auth.uid()))))));


--
-- Name: user_integrations owner_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY owner_only ON public.user_integrations USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: dm_conversations participants create conversations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "participants create conversations" ON public.dm_conversations FOR INSERT TO authenticated WITH CHECK ((((user_a = auth.uid()) OR (user_b = auth.uid())) AND public.can_dm(auth.uid(),
CASE
    WHEN (user_a = auth.uid()) THEN user_b
    ELSE user_a
END)));


--
-- Name: dm_messages participants read messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "participants read messages" ON public.dm_messages FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.dm_conversations dc
  WHERE ((dc.id = dm_messages.conversation_id) AND ((dc.user_a = auth.uid()) OR (dc.user_b = auth.uid()))))));


--
-- Name: dm_conversations participants read own conversations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "participants read own conversations" ON public.dm_conversations FOR SELECT TO authenticated USING (((user_a = auth.uid()) OR (user_b = auth.uid())));


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: push_chat_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.push_chat_log ENABLE ROW LEVEL SECURITY;

--
-- Name: push_subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: reminders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;

--
-- Name: board_collaborators see own or owned collaborator rows; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "see own or owned collaborator rows" ON public.board_collaborators FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.boards b
  WHERE ((b.id = board_collaborators.board_id) AND (b.user_id = auth.uid()))))));


--
-- Name: boards server admins insert server boards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "server admins insert server boards" ON public.boards FOR INSERT TO authenticated WITH CHECK (((server_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.server_members
  WHERE ((server_members.server_id = boards.server_id) AND (server_members.user_id = auth.uid()) AND (server_members.role = ANY (ARRAY['owner'::text, 'admin'::text])))))));


--
-- Name: boards server admins update server boards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "server admins update server boards" ON public.boards FOR UPDATE TO authenticated USING (((server_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.server_members
  WHERE ((server_members.server_id = boards.server_id) AND (server_members.user_id = auth.uid()) AND (server_members.role = ANY (ARRAY['owner'::text, 'admin'::text])))))));


--
-- Name: boards server members read server boards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "server members read server boards" ON public.boards FOR SELECT TO authenticated USING (((server_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.server_members
  WHERE ((server_members.server_id = boards.server_id) AND (server_members.user_id = auth.uid()))))));


--
-- Name: server_audit_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.server_audit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: server_backups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.server_backups ENABLE ROW LEVEL SECURITY;

--
-- Name: server_backups server_backups_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY server_backups_delete ON public.server_backups FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.server_members
  WHERE ((server_members.server_id = server_backups.server_id) AND (server_members.user_id = auth.uid()) AND (server_members.role = 'owner'::text)))));


--
-- Name: server_backups server_backups_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY server_backups_insert ON public.server_backups FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.server_members
  WHERE ((server_members.server_id = server_backups.server_id) AND (server_members.user_id = auth.uid()) AND (server_members.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));


--
-- Name: server_backups server_backups_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY server_backups_select ON public.server_backups FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.server_members
  WHERE ((server_members.server_id = server_backups.server_id) AND (server_members.user_id = auth.uid())))));


--
-- Name: server_backups server_backups_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY server_backups_update ON public.server_backups FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.server_members
  WHERE ((server_members.server_id = server_backups.server_id) AND (server_members.user_id = auth.uid()) AND (server_members.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));


--
-- Name: server_bots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.server_bots ENABLE ROW LEVEL SECURITY;

--
-- Name: server_bots server_bots_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY server_bots_delete ON public.server_bots FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.server_members m
  WHERE ((m.server_id = server_bots.server_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));


--
-- Name: server_bots server_bots_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY server_bots_select ON public.server_bots FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.server_members m
  WHERE ((m.server_id = server_bots.server_id) AND (m.user_id = auth.uid()) AND (m.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));


--
-- Name: server_invites; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.server_invites ENABLE ROW LEVEL SECURITY;

--
-- Name: server_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.server_members ENABLE ROW LEVEL SECURITY;

--
-- Name: server_publishes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.server_publishes ENABLE ROW LEVEL SECURITY;

--
-- Name: servers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.servers ENABLE ROW LEVEL SECURITY;

--
-- Name: user_integrations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_integrations ENABLE ROW LEVEL SECURITY;

--
-- Name: boards users delete own boards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users delete own boards" ON public.boards FOR DELETE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: boards users insert own boards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users insert own boards" ON public.boards FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: boards users read own boards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users read own boards" ON public.boards FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: boards users update own boards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users update own boards" ON public.boards FOR UPDATE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: webhook_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.webhook_items ENABLE ROW LEVEL SECURITY;

--
-- Name: webhook_items webhook_items_consume; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY webhook_items_consume ON public.webhook_items FOR UPDATE TO authenticated USING (public.can_access_board(board_id)) WITH CHECK (public.can_access_board(board_id));


--
-- Name: webhook_items webhook_items_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY webhook_items_read ON public.webhook_items FOR SELECT TO authenticated USING (public.can_access_board(board_id));


--
-- Name: webhook_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.webhook_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: webhook_tokens webhook_tokens_manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY webhook_tokens_manage ON public.webhook_tokens FOR INSERT TO authenticated WITH CHECK (public.can_moderate_board(public.board_uuid_of(board_id)));


--
-- Name: webhook_tokens webhook_tokens_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY webhook_tokens_read ON public.webhook_tokens FOR SELECT TO authenticated USING (public.can_moderate_board(public.board_uuid_of(board_id)));


--
-- Name: webhook_tokens webhook_tokens_revoke; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY webhook_tokens_revoke ON public.webhook_tokens FOR DELETE TO authenticated USING (public.can_moderate_board(public.board_uuid_of(board_id)));


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION board_uuid_of(p_board_id text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.board_uuid_of(p_board_id text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.board_uuid_of(p_board_id text) TO authenticated;


--
-- Name: FUNCTION boards_guard_owner(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.boards_guard_owner() FROM PUBLIC;


--
-- Name: FUNCTION can_access_board(p_board_id text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.can_access_board(p_board_id text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.can_access_board(p_board_id text) TO authenticated;


--
-- Name: FUNCTION can_moderate_board(p_board_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.can_moderate_board(p_board_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.can_moderate_board(p_board_id uuid) TO authenticated;


--
-- Name: FUNCTION community_category_counts(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.community_category_counts() FROM PUBLIC;
GRANT ALL ON FUNCTION public.community_category_counts() TO anon;
GRANT ALL ON FUNCTION public.community_category_counts() TO authenticated;


--
-- Name: FUNCTION contrib_guard_moderation_fields(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.contrib_guard_moderation_fields() FROM PUBLIC;


--
-- Name: FUNCTION create_board_share(p_board_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_board_share(p_board_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_board_share(p_board_id uuid) TO authenticated;


--
-- Name: FUNCTION delete_contribution(p_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.delete_contribution(p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.delete_contribution(p_id uuid) TO authenticated;


--
-- Name: FUNCTION get_invite(invite_code text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_invite(invite_code text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_invite(invite_code text) TO anon;
GRANT ALL ON FUNCTION public.get_invite(invite_code text) TO authenticated;


--
-- Name: FUNCTION handle_new_server(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.handle_new_server() FROM PUBLIC;


--
-- Name: FUNCTION handle_new_user(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;


--
-- Name: FUNCTION increment_community_board_uses(p_board_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.increment_community_board_uses(p_board_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.increment_community_board_uses(p_board_id uuid) TO anon;
GRANT ALL ON FUNCTION public.increment_community_board_uses(p_board_id uuid) TO authenticated;


--
-- Name: FUNCTION is_board_collaborator(p_board_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_board_collaborator(p_board_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_board_collaborator(p_board_id uuid) TO authenticated;


--
-- Name: FUNCTION is_board_editor(p_board_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_board_editor(p_board_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_board_editor(p_board_id uuid) TO authenticated;


--
-- Name: FUNCTION is_member_of_server(server_uuid uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_member_of_server(server_uuid uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_member_of_server(server_uuid uuid) TO authenticated;


--
-- Name: FUNCTION rate_community_board(p_board_id uuid, p_rating integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.rate_community_board(p_board_id uuid, p_rating integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.rate_community_board(p_board_id uuid, p_rating integer) TO authenticated;


--
-- Name: FUNCTION redeem_board_share(p_token text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.redeem_board_share(p_token text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.redeem_board_share(p_token text) TO authenticated;


--
-- Name: FUNCTION redeem_invite(invite_code text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.redeem_invite(invite_code text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.redeem_invite(invite_code text) TO authenticated;


--
-- Name: FUNCTION reset_board_share(p_board_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.reset_board_share(p_board_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.reset_board_share(p_board_id uuid) TO authenticated;


--
-- Name: FUNCTION set_board_share(p_board_id uuid, p_can_edit boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_board_share(p_board_id uuid, p_can_edit boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_board_share(p_board_id uuid, p_can_edit boolean) TO authenticated;


--
-- Name: FUNCTION set_chat_message_pinned(p_message_id uuid, p_pinned boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_chat_message_pinned(p_message_id uuid, p_pinned boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_chat_message_pinned(p_message_id uuid, p_pinned boolean) TO authenticated;


--
-- Name: FUNCTION set_collaborator_can_edit(p_board_id uuid, p_user_id uuid, p_can_edit boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_collaborator_can_edit(p_board_id uuid, p_user_id uuid, p_can_edit boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_collaborator_can_edit(p_board_id uuid, p_user_id uuid, p_can_edit boolean) TO authenticated;


--
-- Name: FUNCTION set_contribution_approved(p_id uuid, p_approved boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_contribution_approved(p_id uuid, p_approved boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_contribution_approved(p_id uuid, p_approved boolean) TO authenticated;


--
-- Name: FUNCTION set_contribution_pinned(p_id uuid, p_pinned boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_contribution_pinned(p_id uuid, p_pinned boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_contribution_pinned(p_id uuid, p_pinned boolean) TO authenticated;


--
-- Name: FUNCTION set_username(p_username text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_username(p_username text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_username(p_username text) TO authenticated;


--
-- Name: FUNCTION toggle_community_board_like(p_board_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.toggle_community_board_like(p_board_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.toggle_community_board_like(p_board_id uuid) TO authenticated;


--
-- Name: FUNCTION track_community_board_use(p_board_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.track_community_board_use(p_board_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.track_community_board_use(p_board_id uuid) TO anon;
GRANT ALL ON FUNCTION public.track_community_board_use(p_board_id uuid) TO authenticated;


--
-- Name: FUNCTION update_server_member_count(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.update_server_member_count() FROM PUBLIC;


--
-- Name: FUNCTION username_available(p_username text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.username_available(p_username text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.username_available(p_username text) TO authenticated;
GRANT ALL ON FUNCTION public.username_available(p_username text) TO anon;


--
-- Name: TABLE animation_presets; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.animation_presets TO anon;
GRANT ALL ON TABLE public.animation_presets TO authenticated;
GRANT ALL ON TABLE public.animation_presets TO service_role;


--
-- Name: TABLE block_archives; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.block_archives TO anon;
GRANT ALL ON TABLE public.block_archives TO authenticated;
GRANT ALL ON TABLE public.block_archives TO service_role;


--
-- Name: TABLE board_chat_messages; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.board_chat_messages TO anon;
GRANT ALL ON TABLE public.board_chat_messages TO authenticated;
GRANT ALL ON TABLE public.board_chat_messages TO service_role;


--
-- Name: TABLE board_chat_reactions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.board_chat_reactions TO anon;
GRANT ALL ON TABLE public.board_chat_reactions TO authenticated;
GRANT ALL ON TABLE public.board_chat_reactions TO service_role;


--
-- Name: TABLE board_collaborators; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.board_collaborators TO anon;
GRANT ALL ON TABLE public.board_collaborators TO authenticated;
GRANT ALL ON TABLE public.board_collaborators TO service_role;


--
-- Name: TABLE board_item_contributions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.board_item_contributions TO anon;
GRANT ALL ON TABLE public.board_item_contributions TO authenticated;
GRANT ALL ON TABLE public.board_item_contributions TO service_role;


--
-- Name: TABLE board_share_links; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.board_share_links TO anon;
GRANT ALL ON TABLE public.board_share_links TO authenticated;
GRANT ALL ON TABLE public.board_share_links TO service_role;


--
-- Name: TABLE boards; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.boards TO anon;
GRANT ALL ON TABLE public.boards TO authenticated;
GRANT ALL ON TABLE public.boards TO service_role;


--
-- Name: TABLE calendar_subscriptions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.calendar_subscriptions TO anon;
GRANT ALL ON TABLE public.calendar_subscriptions TO authenticated;
GRANT ALL ON TABLE public.calendar_subscriptions TO service_role;


--
-- Name: TABLE chat_notification_prefs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.chat_notification_prefs TO anon;
GRANT ALL ON TABLE public.chat_notification_prefs TO authenticated;
GRANT ALL ON TABLE public.chat_notification_prefs TO service_role;


--
-- Name: TABLE community_board_likes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.community_board_likes TO anon;
GRANT ALL ON TABLE public.community_board_likes TO authenticated;
GRANT ALL ON TABLE public.community_board_likes TO service_role;


--
-- Name: TABLE community_board_ratings; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.community_board_ratings TO anon;
GRANT ALL ON TABLE public.community_board_ratings TO authenticated;
GRANT ALL ON TABLE public.community_board_ratings TO service_role;


--
-- Name: TABLE community_board_uses; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.community_board_uses TO anon;
GRANT ALL ON TABLE public.community_board_uses TO authenticated;
GRANT ALL ON TABLE public.community_board_uses TO service_role;


--
-- Name: TABLE community_boards; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.community_boards TO anon;
GRANT ALL ON TABLE public.community_boards TO authenticated;
GRANT ALL ON TABLE public.community_boards TO service_role;


--
-- Name: TABLE dm_conversations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.dm_conversations TO anon;
GRANT ALL ON TABLE public.dm_conversations TO authenticated;
GRANT ALL ON TABLE public.dm_conversations TO service_role;


--
-- Name: TABLE dm_messages; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.dm_messages TO anon;
GRANT ALL ON TABLE public.dm_messages TO authenticated;
GRANT ALL ON TABLE public.dm_messages TO service_role;


--
-- Name: TABLE file_bank_files; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.file_bank_files TO anon;
GRANT ALL ON TABLE public.file_bank_files TO authenticated;
GRANT ALL ON TABLE public.file_bank_files TO service_role;


--
-- Name: TABLE friendships; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.friendships TO anon;
GRANT ALL ON TABLE public.friendships TO authenticated;
GRANT ALL ON TABLE public.friendships TO service_role;


--
-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.profiles TO anon;
GRANT ALL ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;


--
-- Name: TABLE push_chat_log; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.push_chat_log TO anon;
GRANT ALL ON TABLE public.push_chat_log TO authenticated;
GRANT ALL ON TABLE public.push_chat_log TO service_role;


--
-- Name: TABLE push_subscriptions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.push_subscriptions TO anon;
GRANT ALL ON TABLE public.push_subscriptions TO authenticated;
GRANT ALL ON TABLE public.push_subscriptions TO service_role;


--
-- Name: TABLE reminders; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.reminders TO anon;
GRANT ALL ON TABLE public.reminders TO authenticated;
GRANT ALL ON TABLE public.reminders TO service_role;


--
-- Name: TABLE server_audit_logs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.server_audit_logs TO anon;
GRANT ALL ON TABLE public.server_audit_logs TO authenticated;
GRANT ALL ON TABLE public.server_audit_logs TO service_role;


--
-- Name: TABLE server_backups; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.server_backups TO anon;
GRANT ALL ON TABLE public.server_backups TO authenticated;
GRANT ALL ON TABLE public.server_backups TO service_role;


--
-- Name: TABLE server_bots; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.server_bots TO anon;
GRANT ALL ON TABLE public.server_bots TO authenticated;
GRANT ALL ON TABLE public.server_bots TO service_role;


--
-- Name: TABLE server_invites; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.server_invites TO anon;
GRANT ALL ON TABLE public.server_invites TO authenticated;
GRANT ALL ON TABLE public.server_invites TO service_role;


--
-- Name: TABLE server_members; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.server_members TO anon;
GRANT ALL ON TABLE public.server_members TO authenticated;
GRANT ALL ON TABLE public.server_members TO service_role;


--
-- Name: TABLE server_publishes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.server_publishes TO anon;
GRANT ALL ON TABLE public.server_publishes TO authenticated;
GRANT ALL ON TABLE public.server_publishes TO service_role;


--
-- Name: TABLE servers; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.servers TO anon;
GRANT ALL ON TABLE public.servers TO authenticated;
GRANT ALL ON TABLE public.servers TO service_role;


--
-- Name: TABLE user_integrations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_integrations TO anon;
GRANT ALL ON TABLE public.user_integrations TO authenticated;
GRANT ALL ON TABLE public.user_integrations TO service_role;


--
-- Name: TABLE webhook_items; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.webhook_items TO anon;
GRANT ALL ON TABLE public.webhook_items TO authenticated;
GRANT ALL ON TABLE public.webhook_items TO service_role;


--
-- Name: TABLE webhook_tokens; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.webhook_tokens TO anon;
GRANT ALL ON TABLE public.webhook_tokens TO authenticated;
GRANT ALL ON TABLE public.webhook_tokens TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- PostgreSQL database dump complete
--



CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.board_chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.board_chat_reactions;
ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.board_item_contributions;
ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.boards;
ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.dm_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.file_bank_files;

-- Reminder delivery worker (pg_cron + pg_net). Requires the one-time vault secret:
--   select vault.create_secret('<CRON_SECRET>', 'cron_secret');
do $$
begin
  create extension if not exists pg_cron;
  create extension if not exists pg_net;

  begin
    perform cron.unschedule('deliver-reminders');
  exception when others then
    null;
  end;

  perform cron.schedule(
    'deliver-reminders',
    '30 seconds',
    $cron$
      select net.http_post(
        url     := 'https://crecoard.com/api/cron/reminders',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization',
            'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
        )
      );
    $cron$
  );

  raise notice 'Scheduled deliver-reminders';
exception
  when others then
    raise notice 'Reminder schedule skipped (pg_cron/pg_net/vault unavailable): %', sqlerrm;
end $$;

-- Storage: uploads bucket. Public reads work via URL without a policy;
-- uploads/deletes are restricted to the user's own folder.
insert into storage.buckets (id, name, public)
values ('uploads', 'uploads', true)
on conflict (id) do nothing;

create policy "uploads_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'uploads' and split_part(name, '/', 1) = auth.uid()::text);

create policy "uploads_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'uploads' and split_part(name, '/', 1) = auth.uid()::text);
