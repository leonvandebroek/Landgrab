# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

This repository is for **VirtuBattle**: a game people play outside with their phones to battle
each other virtually. Currently in the iOS proof-of-concept phase (milestones M0 to M4).

- `server/`: ASP.NET Core (.NET 10) SignalR hub, in-memory rooms. `cd server && dotnet test`.
- `ios/`: SwiftUI app, iOS 18+, Swift 6 strict concurrency. The Xcode project is generated from
  `ios/project.yml` with XcodeGen and is not committed. UI-free logic lives in the local package
  `ios/Packages/VirtuBattleCore` (`swift test` there). App code can only be built on a Mac.
- Hub contracts are duplicated in `server/VirtuBattle.Server/Hubs/GameContracts.cs` and
  `ios/Packages/VirtuBattleCore/Sources/GameClient/GameMessages.swift`; change both together.
- No CI or pipelines for the proof of concept (owner's decision).

## Archive

`archive/landgrab/` contains the previous Landgrab implementation (ASP.NET Core + SignalR backend,
React + Vite frontend). It is **reference only**:

- Do not modify, build, test or deploy anything under `archive/`.
- Do not reference archive code from new code (no project references, imports or path aliases).
  Copy and adapt what you need instead.
- See `archive/landgrab/ARCHIVE.md` and `archive/landgrab/CLAUDE.md` for what is in there.
