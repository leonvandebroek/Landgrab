# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

This repository is for **VirtuBattle**: a game people play outside with their phones to battle
each other virtually. The new implementation has not started yet.

## Archive

`archive/landgrab/` contains the previous Landgrab implementation (ASP.NET Core + SignalR backend,
React + Vite frontend). It is **reference only**:

- Do not modify, build, test or deploy anything under `archive/`.
- Do not reference archive code from new code (no project references, imports or path aliases).
  Copy and adapt what you need instead.
- See `archive/landgrab/ARCHIVE.md` and `archive/landgrab/CLAUDE.md` for what is in there.
