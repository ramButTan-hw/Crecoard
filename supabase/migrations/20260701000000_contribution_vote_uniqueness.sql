-- Enforce one-vote-per-user for the vote-like contribution kinds at the DB level.
-- Previously this was only client-enforced (poll cast via editOwn/removeOwn), so a
-- crafted API call could insert duplicate votes. Partial unique indexes make it
-- impossible without touching the other kinds (suggestion/guestbook allow many per user).

-- Poll: one 'vote' row per (poll item, author). Switching choice is an UPDATE of
-- content, so the indexed columns don't change and no conflict occurs.
-- Suggestion upvote: one 'upvote' row per (suggestion box item, author, suggestion id
-- in content) — a user may upvote many suggestions in one box, but each only once.

-- Drop any pre-existing duplicates first (keep the most recent), else the unique
-- index creation would fail on data captured before this constraint existed.
delete from public.board_item_contributions c
using (
  select id, row_number() over (
    partition by item_id, author_id
    order by created_at desc, id desc
  ) as rn
  from public.board_item_contributions
  where kind = 'vote'
) d
where c.id = d.id and d.rn > 1;

delete from public.board_item_contributions c
using (
  select id, row_number() over (
    partition by item_id, author_id, content
    order by created_at desc, id desc
  ) as rn
  from public.board_item_contributions
  where kind = 'upvote'
) d
where c.id = d.id and d.rn > 1;

create unique index if not exists board_item_contributions_one_vote_idx
  on public.board_item_contributions (item_id, author_id)
  where kind = 'vote';

create unique index if not exists board_item_contributions_one_upvote_idx
  on public.board_item_contributions (item_id, author_id, content)
  where kind = 'upvote';
