# AI Onboarding

This project uses two MCP servers as the default AI context layer for day-to-day development:

- **Context7 MCP** for current, version-aware library documentation and examples
- **GitHub MCP** for repository, issue, pull request, and workflow access

These MCPs are **developer-tool integrations**, not runtime dependencies of the Express app.

## Repository-Shared MCP Config

This repository now includes project-scoped MCP config for the three main clients we use:

- **Cursor**: `.cursor/mcp.json`
- **Claude Code**: `.mcp.json`
- **Codex**: `.codex/config.toml` in trusted projects

These committed files share the **server definitions**, but they do **not** store secrets.
For Codex, open this repository as a trusted project before running project-specific MCP commands, otherwise Codex may fall back to user-level MCP config.

## Per-User Authentication Model

### Context7 MCP

- This repo uses the **OAuth endpoint**: `https://mcp.context7.com/mcp/oauth`.
- That avoids committing a shared API key.
- Each developer authenticates interactively inside their client after the server is added.
- If a client does not support MCP OAuth, Context7 documents API key auth as the fallback.

### GitHub MCP

- This repo uses GitHub's hosted remote MCP server.
- **Cursor**, **Claude Code**, and **Codex** use a per-user `GIVETH_GITHUB_MCP_PAT`.
- In Claude Code, if `GIVETH_GITHUB_MCP_PAT` is missing, GitHub may show `Failed to connect` or return `401` while the other project MCP servers still load.
- We do **not** share one PAT across the team.
- Access stays tied to the developer's own GitHub identity and token scopes.

## What We Use Each MCP For

### Context7 MCP

**What it is**

Context7 is an MCP server for up-to-date, version-specific documentation and code examples pulled directly from source docs and repositories.

**Why we want it here**

- This repo depends on fast-moving tools where stale examples are expensive
- It is useful for Express, TypeScript, Ethers.js, Viem, Mocha, Chai, Sinon, and Supertest
- It gives agents a safer default path for API verification before they suggest changes

**Project choice**

- We use the **OAuth** endpoint in shared config: `https://mcp.context7.com/mcp/oauth`
- That keeps Context7 credentials out of version control
- In Codex, open and trust this repo first, then run `codex mcp get context7` and confirm the URL is `https://mcp.context7.com/mcp/oauth`
- After that check, authenticate it with `codex mcp login context7`

**Official docs**

- [Context7 overview](https://context7.com/docs/overview)
- [Context7 installation](https://context7.com/docs/installation)
- [Context7 OAuth](https://context7.com/docs/howto/oauth)
- [Adding libraries to Context7](https://context7.com/docs/adding-libraries)

**Client setup links**

- Cursor: [Context7 Cursor setup](https://context7.com/docs/clients/cursor)
- Claude Code: [Context7 Claude Code setup](https://context7.com/docs/clients/claude-code)
- Codex: [OpenAI Codex MCP docs](https://developers.openai.com/codex/mcp) plus [Context7 all clients](https://context7.com/docs/resources/all-clients) and [Context7 OAuth](https://context7.com/docs/howto/oauth)

Inference from the official docs and local verification:

- Context7's published Codex example currently shows the API-key variant using `https://mcp.context7.com/mcp` and `CONTEXT7_API_KEY`.
- This repo intentionally uses Context7's OAuth endpoint instead, because current Codex supports MCP OAuth and can authenticate it with `codex mcp login context7`.

### GitHub MCP

**What it is**

GitHub's official MCP server connects AI tools directly to GitHub for repository browsing, code access, issues, pull requests, workflows, releases, and other platform data.

**Why we want it here**

- Inspect PRs, issues, and workflow runs without leaving the coding flow
- Work with remote repository state that local git history does not fully cover
- Support review and triage tasks that need live GitHub context

**Project choice**

- We use GitHub's hosted remote server
- Cursor, Claude Code, and Codex reference a per-user `GIVETH_GITHUB_MCP_PAT`
- In Claude Code, the shared `.mcp.json` uses `${GIVETH_GITHUB_MCP_PAT:-}` so a missing PAT does not break the rest of the project-scoped config

**Official docs**

- [GitHub MCP Server repository](https://github.com/github/github-mcp-server)
- [Host integration and auth](https://github.com/github/github-mcp-server/blob/main/docs/host-integration.md)
- [Extend GitHub Copilot coding agent with MCP](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/extend-coding-agent-with-mcp)

**Client setup links**

- Cursor: [GitHub MCP Cursor guide](https://github.com/github/github-mcp-server/blob/main/docs/installation-guides/install-cursor.md)
- Claude Code: [Anthropic Claude Code MCP docs](https://docs.anthropic.com/en/docs/claude-code/mcp) plus [GitHub MCP Claude Code guide](https://github.com/github/github-mcp-server/blob/main/docs/installation-guides/install-claude.md)
- Codex: [GitHub MCP Codex guide](https://github.com/github/github-mcp-server/blob/main/docs/installation-guides/install-codex.md)

## Shared Config Files In This Repo

### `.cursor/mcp.json`

- Provides project-scoped config for Cursor
- Uses `context7` and `github`
- Uses `${env:GIVETH_GITHUB_MCP_PAT}` for GitHub auth

### `.mcp.json`

- Provides project-scoped config for Claude Code
- Uses explicit `type: "http"` entries, matching Claude Code's current project config format
- Uses the hosted GitHub MCP URL with an `Authorization` header built from `${GIVETH_GITHUB_MCP_PAT:-}`
- The `:-` default avoids breaking `.mcp.json` parsing when `GIVETH_GITHUB_MCP_PAT` is unset
- If `GIVETH_GITHUB_MCP_PAT` is not set, GitHub may appear as `Failed to connect` in Claude Code while Context7 still loads

### `.codex/config.toml`

- Provides project-scoped config for Codex
- Applies in trusted projects
- Uses `context7` and `github`
- Uses the Context7 OAuth endpoint
- Before authenticating Context7, run `codex mcp get context7` in this repo and confirm it resolves to `https://mcp.context7.com/mcp/oauth`
- If `codex mcp get context7` resolves to `https://mcp.context7.com/mcp`, Codex is still using a user-level Context7 server and the project config is not active yet
- Once the project config is active, authenticate Context7 with `codex mcp login context7`
- Uses `bearer_token_env_var = "GIVETH_GITHUB_MCP_PAT"` for GitHub auth

## Setting Up `GIVETH_GITHUB_MCP_PAT` for Terminal and Desktop Apps

On macOS, GUI apps (Claude, Codex, Cursor) do **not** read shell config files like `~/.zshenv`. You need to set the env var in two places.

### 1. Terminal apps (shell)

Add this to `~/.zshenv`:

```bash
export GIVETH_GITHUB_MCP_PAT='github_pat_YOUR_TOKEN_HERE'
```

This covers Claude Code CLI and any terminal-based tool.

### 2. Desktop / GUI apps (launchctl)

macOS GUI apps inherit environment from `launchd`, not from your shell. To make the variable visible to Claude, Codex, and Cursor desktop apps, add this line to `~/.zshenv` **after** the export:

```bash
launchctl setenv GIVETH_GITHUB_MCP_PAT "$GIVETH_GITHUB_MCP_PAT"
```

Your `~/.zshenv` should look like:

```bash
export GIVETH_GITHUB_MCP_PAT='github_pat_YOUR_TOKEN_HERE'
launchctl setenv GIVETH_GITHUB_MCP_PAT "$GIVETH_GITHUB_MCP_PAT"
```

### Verifying

- **Terminal**: `echo $GIVETH_GITHUB_MCP_PAT`
- **GUI apps**: `launchctl getenv GIVETH_GITHUB_MCP_PAT`

Both should print your token.

### Caveat: GUI apps opened before any terminal

The `~/.zshenv` approach only runs `launchctl setenv` when a **zsh shell process starts**. If you reboot and open Claude, Codex, or Cursor **before** opening a terminal, no shell has run yet, so the variable won't be set for those apps.

For most developers this is fine — opening a terminal is usually one of the first things you do. But if you want the variable available to GUI apps **unconditionally at login** (even without opening a terminal first), use a **LaunchAgent plist** instead.

### Alternative: LaunchAgent plist (guaranteed at login)

Create `~/Library/LaunchAgents/com.giveth.github-pat.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.giveth.github-pat</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/launchctl</string>
    <string>setenv</string>
    <string>GIVETH_GITHUB_MCP_PAT</string>
    <string>github_pat_YOUR_TOKEN_HERE</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
</dict>
</plist>
```

Then load it (or log out and back in):

```bash
launchctl load ~/Library/LaunchAgents/com.giveth.github-pat.plist
```

This runs at every login, before any GUI app starts, so the variable is always available. Note that the plist contains the **raw token value** (not a shell variable reference) because it runs outside of any shell context.

### Important notes

- **After changing the token in `~/.zshenv`**: open a new terminal (so the new export and `launchctl setenv` run), then restart any already-running desktop apps.
- **After changing the token in the plist**: you must reload the agent (`launchctl unload` then `launchctl load` the plist, or log out and back in) before restarting desktop apps — simply restarting the apps is not enough, because `launchd` still has the old value until the plist is reloaded.
- Do **not** wrap the token in `$(echo ...)` — pass it as a plain string or use `"$VARIABLE"` expansion.
- The plist file is local to your machine and should **not** be committed to version control.

## Verification Checklist

After pulling the repo config, each developer should verify:

1. **Context7**: in Codex, open and trust this repo, run `codex mcp get context7`, confirm the URL is `https://mcp.context7.com/mcp/oauth`, then run `codex mcp login context7`; in other clients, authenticate after the OAuth endpoint appears
2. **GitHub**: `GIVETH_GITHUB_MCP_PAT` is available in Cursor, Claude Code, and Codex
3. **Cursor**: the servers appear in the MCP settings and show as connected
4. **Claude Code**: run `claude mcp list`; if GitHub shows `Failed to connect`, confirm `GIVETH_GITHUB_MCP_PAT` is set in the Claude Code environment
5. **Codex**: start Codex in this repository, verify the project-scoped MCP servers are available from MCP settings, and confirm Context7 is logged in against the project-scoped `/oauth` server

## Sources

Official vendor documentation and official repositories were used, and local CLI verification was performed where client behavior needed confirmation.

- Context7: [Overview](https://context7.com/docs/overview)
- Context7: [Installation](https://context7.com/docs/installation)
- Context7: [Cursor setup](https://context7.com/docs/clients/cursor)
- Context7: [Claude Code setup](https://context7.com/docs/clients/claude-code)
- Context7: [OAuth](https://context7.com/docs/howto/oauth)
- Context7: [All clients](https://context7.com/docs/resources/all-clients)
- Context7: [Adding libraries](https://context7.com/docs/adding-libraries)
- Cursor: [Model Context Protocol docs](https://docs.cursor.com/context/model-context-protocol)
- Anthropic: [Claude Code MCP docs](https://docs.anthropic.com/en/docs/claude-code/mcp)
- OpenAI: [Codex MCP docs](https://developers.openai.com/codex/mcp)
- GitHub: [GitHub MCP Server repository](https://github.com/github/github-mcp-server)
- GitHub: [Host integration and auth](https://github.com/github/github-mcp-server/blob/main/docs/host-integration.md)
- GitHub: [Cursor installation guide](https://github.com/github/github-mcp-server/blob/main/docs/installation-guides/install-cursor.md)
- GitHub: [Claude Code installation guide](https://github.com/github/github-mcp-server/blob/main/docs/installation-guides/install-claude.md)
- GitHub: [Codex installation guide](https://github.com/github/github-mcp-server/blob/main/docs/installation-guides/install-codex.md)
- GitHub Docs: [Extend GitHub Copilot coding agent with MCP](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/extend-coding-agent-with-mcp)
