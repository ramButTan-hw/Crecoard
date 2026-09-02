<p align="center">
  <a href="https://crecoard.com">
    <img src="docs/Crecoard_Banner.png" alt="Crecoard" width="100%">
  </a>
</p>

# Crecoard

**A collaborative visual workspace — an infinite board canvas where you build your workflow out of drag-and-drop blocks, custom widgets, and shared spaces.**


> **Live:** [crecoard.com](https://crecoard.com)

## Sample Boards and Features
<img width="1468" height="833" alt="image" src="https://github.com/user-attachments/assets/b3beeafa-c7ea-41f1-9a17-dcefe32caa53" />
<img width="1468" height="833" alt="image" src="https://github.com/user-attachments/assets/2c6540fe-df65-421e-bbdc-cde4bea52d9b" />
<img width="1468" height="833" alt="image" src="https://github.com/user-attachments/assets/c9516d7c-90f4-4131-aedf-7aef00d88a3b" />



## Roadmap

- [ ] Notifications 
- [ ] Fully implement community item implementations
- [ ] Mobile app
- [ ] Widget collections
- [ ] MacOS suport


## Tech stack

| Layer | Tools |
| --- | --- |
| Web | Next.js 16, React 19, TypeScript, Tailwind CSS, Zustand |
| Database | Supabase |
| Desktop | Electron, electron-builder, electron-updater |
| Tooling | Turborepo, npm workspaces |


---

## Running locally

Requires **Node 20+** and a free [Supabase](https://supabase.com) project.

```bash
npm install

# Configure the web app
cp apps/web/.env.example apps/web/.env.local
# → fill in your Supabase URL + anon key (and any optional service keys)

# Apply the database schema to your Supabase project
# (run the files in supabase/migrations/ in order via the Supabase SQL editor)

npm run dev        # starts the web app via Turborepo
```

Other scripts: `npm run build`, `npm run lint`, `npm run type-check`.

---

## License

[MIT](LICENSE) © Jintian Wu
