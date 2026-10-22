# Frontend — GenLayer Freelance Evaluator

A dependency-light single page application (Vite + vanilla JavaScript) for the
`TaskEvaluator` intelligent contract.

## Quick start

```bash
npm install
cp .env.example .env   # add your deployed contract address
npm run dev            # http://localhost:5173
```

## Configuration

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `VITE_CONTRACT_ADDRESS` | *(empty)* | Deployed `TaskEvaluator` address |
| `VITE_GENLAYER_RPC_URL` | *(chain default)* | Custom RPC endpoint |
| `VITE_GENLAYER_CHAIN` | `studionet` | `studionet`, `localnet`, `testnetBradbury`, `testnetAsimov` |

The contract address can also be changed at runtime from the **Settings** dialog;
it is persisted in `localStorage` only.

## Source layout

| File | Purpose |
| :--- | :--- |
| `src/main.js` | Application logic: tabs, forms, task inspector, recent tasks |
| `src/genlayer.js` | `genlayer-js` wrapper: read/write calls, wallet handling |
| `src/ui.js` | Toasts, formatting, escaping and clipboard helpers |
| `src/style.css` | Design system (dark theme, no CSS framework) |

## Scripts

| Command | Description |
| :--- | :--- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the production build locally |
