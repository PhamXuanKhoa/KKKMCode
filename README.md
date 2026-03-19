# KKKM AI Agent IDE

An AI-powered IDE clone built with React, TypeScript, and Express, featuring a built-in terminal and LLM integration.

## Project Structure

This is a monorepo containing:

- `frontend/`: A React-based IDE interface using Vite, Monaco Editor, and XTerm.js.
- `backend/`: An Express.js server handling LLM requests, file system operations, and terminal sessions via WebSockets.

## Key Features

- **AI Code Assistance**: Integrated with llama-cpp to run local LLMs for code generation and analysis.
- **Embedded Editor**: Full-featured code editor powered by Monaco Editor.
- **Integrated Terminal**: Real-time terminal access using `node-pty` and WebSockets.
- **Modern UI**: Built with Radix UI and Tailwind CSS for a premium, responsive experience.

## Getting Started

### Prerequisites

- Node.js (v18+)
- npm

### Backend Setup

1.  Navigate to the `backend` directory:
    ```bash
    cd backend
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  **Start Local LLM Server**: Ensure you have an OpenAI-compatible server (like `llama-cpp` or `ollama`) running on `http://localhost:8080`.
    - Recommended model: `Qwen 2.5` (GGUF format).
4.  Start the backend server:
    ```bash
    node app.js
    ```

### Frontend Setup

1.  Navigate to the `frontend` directory:
    ```bash
    cd frontend
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Start the development server:
    ```bash
    npm run dev
    ```

## Technologies Used

- **LLM**: llama.cpp (Local-only, privacy-focused).
- **Frontend**: React, TypeScript, Vite, Monaco Editor, XTerm.js, Radix UI, Tailwind CSS, Framer Motion.
- **Backend**: Express, Node.js, WebSockets (ws), node-pty.
