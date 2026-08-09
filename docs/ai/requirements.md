# ft_transcendence — Subject Requirements

> Source: translated from the Japanese original at md_files/01_課題/ft_トランセンデンス.md (archived).

## 📌 This team's adoption status and progress (how to read the checkboxes)

> The subject text itself is fixed as distributed by 42 and does not change.
> **Only the checkboxes are annotated with this team's adoption decisions.**
>
> | Symbol | Meaning |
> |---|---|
> | **◎** | Declared. All mandatory-requirement items, plus 12 selected modules = **19pt** (core 14 + bonus 5) |
> | `[ ]` | Not adopted |
>
> **Lineup revised 2026-08-08 (D-19).** The reserve/〇 tier was removed — those modules are either
> promoted into the declared set or dropped outright. Rationale and the full before/after are in
> [architecture.md §4.5](./architecture.md); the human-readable version with implementation status is
> [`../human/評価対応/42モジュール対応表.html`](../human/評価対応/42モジュール対応表.html).
>
> ### Parts already complete (as of 2026-07-23, plus three later dated exceptions called out inline below: B-02, G-11, and G-12, all 2026-08-09)
>
> **The game engine's planned work is complete.** Not everything remains "to be built."
>
> - **Both games are implemented** and run both natively and in the browser (WASM):
>   RSP (rock-paper-scissors tag) and FPS (collect → door → goal race). **FPS's two post-backlog
>   engine defects, G-11 and G-12, were both fixed 2026-08-09** — see backlog.md §3.1. (Online 1v1
>   overall still needs B-04/F-05/B-09, unrelated to these two.)
> - **The AI opponent is also complete.** The RSP AI "chases when it holds a winning move, flees when it holds a losing move"; the FPS AI has search, patrol, and pathfinding-based pursuit.
> - **The server-authoritative simulation (`sim.wasm`) and the snapshot-delivery entry point are complete.** The engine-side components needed for online play are in place.
> - 4 battle maps, acceptance tests (`make test`, 96 checks), and CI (all jobs green) are also complete.
> - On the web-app side, the skeleton (I-01) is complete.
>
> **What remains is the TypeScript server and frontend** (the part that connects online play).
> For detailed progress, see [5-Backlog §1](./backlog.md); for role assignments, see [6-Team Assignment Plan](../human/はじめに/チーム体制.html).
>
> ### Status by module (declared lineup as of 2026-08-08)
>
> **Core 14pt** — only modules that are hard to reject and cheap to finish:
>
> | Module | pt | Status |
> |---|---|---|
> | Fully web-based game (RSP) | 2 | Engine complete. Online-play conversion remains |
> | Remote players | 2 | Engine + WS complete (incl. B-12 reconnect). Real-login path remains |
> | Multiplayer (3+ players) | 2 | RSP 2v2 = 4 players works engine-side. Lobby UI remains |
> | Framework on both FE and BE | 2 | **Complete** (I-01 / F-01) |
> | WebSockets | 2 | Game WS complete (B-11). Lobby WS integration remains |
> | AI opponent | 2 | **Complete** |
> | ORM (Prisma) | 1 | Not yet started (B-03 — a DB is mandatory under Chapter III anyway) |
> | Game customization | 1 | Engine side (win condition / maps) complete. Selection UI remains |
>
> **Bonus +5pt** — cheap, or safe to lose:
>
> | Module | pt | Status |
> |---|---|---|
> | Advanced 3D graphics | 2 | **Implementation complete** (raycaster, 112fps @960×540). Needs only a README justification. Carries interpretive risk — see architecture.md §4.2 |
> | Custom-made design system | 1 | 9 of the required 10 components already exist |
> | Spectator mode | 1 | GV-06 handles the spectator display path. `spectate` WS action + GV-12 remain |
> | Health check / status page | 1 | `GET /api/health` exists. Status page + backup/recovery remain |
>
> **Dropped from the previous lineup**: standard user management (2pt), game statistics (1pt),
> add another game (2pt), OAuth / 2FA / Prometheus+Grafana. The FPS engine and matchmaking are
> already built and its two post-backlog defects (G-11, G-12) are both fixed, so **B-13 alone
> restores "add another game" (2pt)** — that is the cheapest thing to
> restore if time frees up. "Game statistics" (1pt) needs **B-13 plus F-09** (the profile/history
> screen), so it costs more than the FPS module and should be judged separately.
>
> ### What declaring a module commits you to
>
> During evaluation, **a demo is requested for each declared module, and an incomplete one scores 0pt** (Chapter IV).
> So a ◎ is a commitment, not an aspiration: declare it only if it will actually be finished and
> demonstrable. This is why the lineup was rebuilt around modules that are already done or nearly done
> (D-19) — and why anything not confidently finishable is left unmarked rather than declared hopefully.
>
> The rationale for adoption decisions is in [0-Overall Architecture Design §4](./architecture.md) (module selection and point calculation); the authoritative breakdown of mandatory requirements is in the same document's §5.

---

# Chapter II Foreword

First of all, congratulations on reaching this milestone. You are about to enter the final project of the Common Core, and it is by no means easy.
Transcendence is a group project (4–5 people), aimed at strengthening creativity, confidence, adaptability to new technologies, and teamwork skills.
As a team, you will build a real-world web application, but the modules and decisions you choose may take it in many different directions.
Discuss thoroughly as a whole team before you begin.

The project is split into the following two parts:
- **Mandatory part**: the fixed core of the project, to which every team member must contribute.
- **Modules**: optional, and added to the final grade.

---

## II.1 Team composition and project management
Because this is a group project, proper team organization is essential to success. Clear roles and responsibilities must be established from the outset.

### II.1.1 Mandatory team roles
The team must assign the following roles (for a 4-person team, one person may hold multiple roles).
All roles must be clearly documented in `README.md`.

- [◎] **Product Owner (PO)**: defines the product vision, decides feature priorities, and ensures the project meets user needs.
    - Manages the product backlog.
    - Makes decisions on features and priorities.
    - Verifies completed work.
    - Communicates with stakeholders (evaluators, peers).
- [◎] **Project Manager (PM) / Scrum Master**: facilitates team coordination and removes obstacles.
    - Organizes team meetings and planning sessions.
    - Tracks progress and deadlines.
    - Ensures communication within the team.
    - Manages risks and blockers.
- [◎] **Technical Lead / Architect**: oversees technical decisions and architecture.
    - Defines the technical architecture.
    - Makes technology-stack decisions.
    - Ensures code quality and best practices.
    - Reviews significant code changes.
- [◎] **Developer (all team members)**: implements features and modules.
    - Writes code for assigned features.
    - Participates in code review.
    - Tests their own implementation.
    - Documents their own work.

> **💡 Info: about team size**
> For a team of 4, some members hold multiple roles (e.g., PM + Developer, PO + Developer).
> For a team of 5, more specialized role assignment is possible: a dedicated PO, PM, Tech Lead, and two Developers.

### II.1.2 Recommended project-management practices
Although not mandatory, adopting a few basic project-management practices is strongly recommended to support the team's success.
These are recommendations to help organize the team's work; find what works best for your team. What matters is that everyone contributes and the work is well coordinated.

- [◎] **Regular communication**: meet regularly (weekly or biweekly) to sync on progress and blockers.
- [◎] **Task organization**: use simple tools such as GitHub Issues, Trello, or a shared document to track who is doing what.
- [◎] **Work breakdown**: split the project into smaller, manageable tasks.
- [◎] **Code review**: strive to have every significant code change reviewed by at least one other team member.
- [◎] **Documentation**: keep notes on important decisions and mechanisms.
- [◎] **Communication channels**: use Discord, Slack, etc., for rapid team communication.

> **⚠️ Note: accountability during evaluation**
> During evaluation, the team will be asked to explain the following. Every team member must be able to explain the project and their own contribution.
> - How roles were distributed.
> - How work was organized and divided.
> - How the team communicated and coordinated.
> - How each member contributed to the project.

---

# Chapter III Mandatory part

The content of the project is up to you. You must bring your own ideas and decide, as a team, what kind of application to build.
This is a step up from what you have done previously in the Common Core. You must think about the project as a whole, not just the features you implement.
Of course, you are not completely free — there are constraints — but the idea itself is yours.

## III.1 What are you going to do?
First, you must create a comprehensive `README.md` file.
The detailed README requirements are specified at the end of this document, in the "Chapter VI README Requirements" section.

> **💡 Info: project examples**
> Something like the following would be valid. What matters is creating something compelling that demonstrates technical skill and creativity.
> - A multiplayer Pong game with a tournament system
> - A collaboration platform with real-time features
> - A social network with user interaction
> - An online game with matchmaking (chess, tic-tac-toe, etc.)
> - A project-management application
> - Any other creative web application that meets the requirements

## III.2 General requirements checklist
Building the entire project is complex, and many problems can arise. Therefore, here is a list of general requirements you must follow.
**If you do not follow these, the project will be rejected.**

- [◎] The project must be a web application, requiring a frontend, a backend, and a database.
- [◎] You must use Git with clear, meaningful commit messages. The repository must show:
    - [◎] Commits from all team members.
    - [◎] Clear commit messages describing the changes made.
- [◎] Proper work distribution across the entire team. **At risk**: the team dissolved to a
  single active contributor (samatsum) on 2026-08-05. 4 new members are confirmed to join (date not
  set), which would satisfy the subject's 4–5 person premise, but **nothing is distributed until they
  actually start**, so this checkbox is not on track today — see
  [`../human/はじめに/チーム体制.html`](../human/はじめに/チーム体制.html) §04 for the full writeup.
- [◎] Deployment must use a containerization solution (Docker, Podman, etc.) and run with a single command.
- [◎] The website must be compatible with the latest stable version of Google Chrome.
- [◎] No warnings or errors may appear in the browser console.
- [◎] The project must include accessible Privacy Policy and Terms of Service pages with appropriate content.

> **⚠️ Note: Privacy Policy and Terms of Service**
> These pages will be checked during evaluation. If missing or inadequate, the project will be rejected.
> - Must be easily accessible from the application (e.g., a footer link).
> - Must contain content appropriate to the project.
> - Must not be placeholder or empty pages.


> **⚠️ Note: multi-user support (mandatory core requirement)**
> The website must support multiple users simultaneously.
> Users must be able to interact with the application at the same time without conflicts or performance issues.
> - [◎] Multiple users can be logged in and active at the same time.
> - [◎] Simultaneous actions by different users are handled properly.
> - [◎] Where applicable, real-time updates are reflected to all connected users.
> - [◎] Concurrent user actions do not cause data corruption or race conditions.

## III.3 Technical requirements checklist
As with the previous section, this section is also mandatory. After this, you will be able to select the modules used in the next chapter.

- [◎] A clear, responsive, and accessible frontend on all devices.
- [◎] Use of any CSS framework or styling solution
  (Tailwind CSS, Bootstrap, Material-UI, Styled Components, etc.).
- [◎] Credentials (API keys, environment variables, etc.) are stored in a local env file that is Git-ignored, and an `env.example` file is provided.
- [◎] The database has a clear schema and clearly defined relationships.
- [◎] The application must have a basic user-management system. Users must be able to sign up and log in securely:
    - [◎] At minimum: email-and-password authentication with proper security (hashed passwords, salting, etc.).
    - (Additional authentication methods (OAuth, 2FA, etc.) can be implemented via modules.)
- [◎] All forms and user input are properly validated on both the frontend and the backend.
- [◎] All connections to the backend — from the browser, scripts, external APIs, etc. — use HTTPS.
    - (Connections internal to the backend, e.g., between the web server and the database, or between software inside containers, may be unencrypted.)

> **💡 Info: definition of "framework"**
> For this project, a framework is defined as a comprehensive tool that provides:
> - A structured architecture and conventions for organizing code.
> - Built-in features for common tasks (routing, state management, etc.).
> - A complete ecosystem of tools and libraries.
>
> *Examples:*
> - **Frontend frameworks**: React, Vue, Angular, Svelte, Next.js
>   (Note: React is technically a library, but due to its ecosystem and architectural patterns it is considered a framework in this context.)
> - **Backend frameworks**: Express, Fastify, NestJS, Django, Flask, Ruby on Rails.
> - **Not frameworks**: jQuery (a library), Lodash (a utility library), Axios (an HTTP client).

---

# Chapter IV Module selection checklist

To complete the project, you must **earn a total of 14 points**.
- Major modules = 2 points each
- Minor modules = 1 point each

The following categories are available. You may select multiple modules from any category.
It is strongly recommended that you select modules only after your idea is clear and you fully understand what you want to build.
Also, in case some modules are not validated during evaluation, **it is a good idea to aim for more than 14 total points**.

> **🛑 Important: module dependencies and evaluation**
> - Some modules require another module to be implemented first (marked with an info note).
> - **Mandatory-game modules**: AI Opponent, Tournament, Game customization,
>   Spectator mode, Multiplayer 3+, Add another game each require
>   at least one game to already be implemented.
> - **Game Statistics**: requires a game to be implemented.
> - **Advanced chat features**: require the basic chat feature from the "User interaction" module.
> - **SSR**: is not compatible with the ICP blockchain backend.
> - Plan carefully so that your chosen modules work together coherently.
> - **During evaluation**: you will be asked to demo each declared module. Only fully functional, properly implemented modules count toward the final score.
>   Non-functional or incomplete modules score 0 points.

## IV.1 Web
- [◎] **Major (2pt)**: use a framework on both the frontend and the backend.
    - If you use both the frontend and backend features of a full-stack framework
      (Next.js, Nuxt.js, SvelteKit), it counts as both.
- [ ] **Minor (1pt)**: use a frontend framework.
- [ ] **Minor (1pt)**: use a backend framework.
- [◎] **Major (2pt)**: implement real-time features using WebSockets, etc.
  (cross-client updates, connect/disconnect handling, message broadcasting)
- [ ] **Major (2pt)**: user interaction (basic chat system, profile system, friend system).
- [ ] **Major (2pt)**: public API (secure API keys, rate limiting, documentation, and at least 5 CRUD endpoints).
- [◎] **Minor (1pt)**: use an ORM for the database.
- [ ] **Minor (1pt)**: a complete notification system for all create, update, and delete actions.
- [ ] **Minor (1pt)**: real-time collaboration features (shared workspace, live editing, collaborative drawing, etc.).
- [ ] **Minor (1pt)**: server-side rendering (SSR) for performance and SEO improvement.
- [ ] **Minor (1pt)**: a progressive web app (PWA) with offline support and installability.
- [◎] **Minor (1pt)**: a custom-made design system (at least 10 reusable components, proper color/typography/icons).
  *(bonus. 9 of 10 components already exist)*
- [ ] **Minor (1pt)**: advanced search functionality (filters, sorting, pagination).
- [ ] **Minor (1pt)**: a file upload and management system (multiple types, validation, secure storage, preview, progress, deletion).

## IV.2 Accessibility and internationalization
- [ ] **Major (2pt)**: full accessibility compliance (WCAG 2.1 AA), including screen readers, keyboard navigation, and assistive technologies.
- [ ] **Minor (1pt)**: support for multiple languages (at least 3 languages, i18n, UI switcher).
- [ ] **Minor (1pt)**: right-to-left (RTL) language support
  (at least one RTL language, layout mirroring, seamless switching).
- [ ] **Minor (1pt)**: support for additional browsers (full compatibility with at least 2 additional browsers, consistent UI/UX).

## IV.3 User management
- [ ] **Major (2pt)**: standard user management and authentication
  (profile updates, avatar upload, adding friends and checking online status, profile page).
- [ ] **Minor (1pt)**: game statistics and match history (**requires a game module**).
  *(dropped 2026-08-08; first candidate to restore alongside "add another game" — both unlock from B-13)*
- [ ] **Minor (1pt)**: remote authentication via OAuth 2.0 (Google, GitHub, 42, etc.).
- [ ] **Major (2pt)**: advanced permission system (user CRUD, role management, role-based views and actions).
- [ ] **Major (2pt)**: organization system (organization CRUD, adding/removing users, in-organization actions).
- [ ] **Minor (1pt)**: complete two-factor authentication (2FA) system.
- [ ] **Minor (1pt)**: user-activity analytics and insights dashboard.

## IV.4 Artificial intelligence
- [◎] **Major (2pt)**: introduce an AI opponent to the game (human-like behavior, supports customization. **requires a game module**).
- [ ] **Major (2pt)**: implement a full RAG (Retrieval-Augmented Generation) system.
- [ ] **Major (2pt)**: implement a full LLM system interface (text/image generation, streaming, error/rate-limit handling).
- [ ] **Major (2pt)**: a recommendation system using machine learning (behavior-based, continuously improving).
- [ ] **Minor (1pt)**: content moderation AI.
- [ ] **Minor (1pt)**: voice/speech integration.
- [ ] **Minor (1pt)**: sentiment analysis of user-generated content.
- [ ] **Minor (1pt)**: image recognition and tagging system.

## IV.5 Cybersecurity
- [ ] **Major (2pt)**: implement a hardened WAF/ModSecurity + HashiCorp Vault for secrets.

## IV.6 Gaming and user experience
- [◎] **Major (2pt)**: implement a complete web-based game (real-time play, clear rules, 2D/3D allowed).
- [◎] **Major (2pt)**: remote players (real-time play across separate PCs, latency/disconnect/reconnect handling).
- [◎] **Major (2pt)**: multiplayer game (3+ players) (**requires at least one game implementation**).
- [ ] **Major (2pt)**: add another game with user history and matchmaking (**requires the first game to be implemented**).
  *(FPS engine is complete; dropped only because "user history" needs B-13. Top priority to restore)*
- [◎] **Major (2pt)**: implement advanced 3D graphics (e.g., Three.js or Babylon.js).
  *(bonus. Hand-written C raycaster, no library — see architecture.md §4.2 for the interpretive risk this carries)*
- [ ] **Minor (1pt)**: advanced chat features (blocking, game invites, notifications, history, etc.
  **requires the basic chat implementation from User interaction**).
- [ ] **Minor (1pt)**: implement a tournament system (brackets, matchmaking. **requires a game implementation**).
- [◎] **Minor (1pt)**: game customization options (power-ups, maps, settings, etc. **requires a game implementation**).
- [ ] **Minor (1pt)**: gamification system (3 or more of achievements, badges, leaderboards, etc. Must be stored in the database. Quality over quantity).
- [◎] **Minor (1pt)**: implement a spectator mode for games (**requires a game implementation**).
  *(bonus. GV-06 already handles the spectator display path)*

## IV.7 DevOps
- [ ] **Major (2pt)**: log-management infrastructure using ELK (Elasticsearch, Logstash, Kibana).
- [ ] **Major (2pt)**: monitoring system using Prometheus and Grafana.
- [ ] **Major (2pt)**: backend as microservices (clear interfaces, REST API/message queue, single responsibility).
- [◎] **Minor (1pt)**: a health-check and status-page system with automated backups and disaster-recovery procedures.
  *(bonus. `GET /api/health` already exists)*

## IV.8 Data and analytics
- [ ] **Major (2pt)**: an advanced analytics dashboard with data visualization (interactive charts, real-time updates, export functionality).
- [ ] **Minor (1pt)**: data export and import functionality (multiple formats, validation, bulk operations).
- [ ] **Minor (1pt)**: GDPR compliance features (data requests, deletion with confirmation, export in readable format, confirmation emails).

## IV.9 Blockchain
- [ ] **Major (2pt)**: store tournament scores on a blockchain (using Avalanche/Solidity on a testnet).
- [ ] **Minor (1pt)**: use ICP (Internet Computer Protocol) for the backend
  (not compatible with the SSR module).

## IV.10 Modules of choice
- [ ] **Major (2pt)**: implement a custom module not on the list (must be substantial and demonstrate technical complexity. Must be justified in the README.
  Trivial features will be rejected).
- [ ] **Minor (1pt)**: the same as a Major module, but with smaller scope and less complexity (must be justified in the README).

---

# Chapter V Project ideas and examples

To help you get started and spark creativity, here are concrete project ideas and examples for reaching the required 14 points.
These are only suggestions — you are free to come up with your own ideas.

> **⚠️ Note: criteria for choosing a project**
> What matters is choosing a project that meets the following conditions. Discuss as a team and choose wisely!
> - Engages the team's interest and motivates everyone.
> - Can implement the required modules (14 points minimum).
> - Demonstrates technical complexity and creativity.
> - Can realistically be completed within the project timeline.
> - Has a coherent combination of modules that work well together.

## V.1 Example: building a Pong game
Example of reaching 14 points when building a Pong game:
- Gaming (Web based + Remote + Tournament + Customize) = 6pts
- User Management (Standard + OAuth) = 3pts
- Web (Framework + ORM) = 3pts
- AI (AI Opponent) = 2pts
**Total: 14 points**

## List of other ideas
- **V.2 Games**: multiplayer Pong, online chess, card-game arena, battle royale, trivia/quiz.
- **V.3 Social/collaboration**: social network, collaboration workspace, forum, event management, learning-management system.
- **V.4 Creative/media**: music streaming, video sharing, art gallery, blog, recipe sharing.
- **V.5 Productivity/tools**: task management, code collaboration, booking system, marketplace, fitness tracker.
- **V.6 Specialized**: real-time trading simulator, language learning, pet adoption, travel planning, crowdfunding.

---

# Chapter VI README requirements checklist

You must provide a `README.md` file at the root of the Git repository, **written in English**.
The purpose is to let someone unfamiliar with the project quickly understand it. A poor or incomplete README will negatively affect your evaluation.

- [ ] **First-line declaration**: the first line must be in italics, reading exactly:
  `*This project has been created as part of the 42 curriculum by <login1>[, <login2>[, <login3>[...]]].*`
- [ ] **Description**: a clear project name, key features, purpose, and brief overview.
- [ ] **Instructions**: all prerequisites required
  (software, tools, versions, env setup, etc.) and step-by-step
  instructions for compiling/running.
- [ ] **Resources**: classic references relevant to the topic.
  In addition, **an explanation of how AI was used (for which tasks, in which parts of the project)**.

**[Additional mandatory sections]**
- [ ] **Team Information**: a brief description of the assigned role and responsibilities of each team member mentioned at the start.
- [ ] **Project Management**: how work was organized (task allocation, meetings, etc.), tools used, communication channels.
- [ ] **Technical Stack**: frontend/backend technologies, database system and the reasoning behind the choice, justification for key technical decisions.
- [ ] **Database Schema**: a visual representation or description of the structure, relationships, key fields and data types.
- [ ] **Features List**: a complete list of implemented features, who is responsible for each, and a brief description of how each works.
- [ ] **Modules**: a list of all chosen modules, the point calculation,
  **justification for each module choice (especially for "modules of choice")**, how each was implemented, and who was responsible for each.
- [ ] **Individual Contributions**: a detailed breakdown of what each member contributed
  (features/modules implemented), challenges faced and how they were overcome.
- [ ] *(Optional)* any other useful information (usage, limitations, license, etc.).

---

# Chapter VII Bonus part

The bonus part is only considered **if all the required modules corresponding to the mandatory minimum of 14 points have been implemented**.
Additional modules implemented beyond 14 points become bonus points if they meet the following conditions:
- [ ] Fully functional.
- [ ] Meets the module's requirement description.
- [ ] Adds real value to the project.
- [ ] Includes proper justification in the README.

**Bonus point calculation (maximum 5 points)**:
- Additional Major modules: 2 points each
- Additional Minor modules: 1 point each

---

# Chapter VIII Submission and peer evaluation

- [ ] Submit your assignment through the Git repository as usual. During evaluation, only the work in the repository will be evaluated (double-check the file names).
- [ ] It is recommended that you discuss ideas with your team and peers before starting project work.

**Regarding minor corrections during evaluation**:
During evaluation, you may be asked to make simple modifications to the project. This is to verify your actual understanding of the project.
- Scope: minor behavioral changes, writing/rewriting a few lines of code, simple feature additions, etc.
- Environment: your chosen development environment (your usual setup).
- Time: unless a specific time frame is given, changes achievable within a few minutes (e.g., updating a function/script, a display change, adjusting a data structure).
Detailed scope and targets are specified in the evaluation guidelines and may vary by evaluation.
