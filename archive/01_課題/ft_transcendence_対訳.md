# ft_transcendence 課題書 対訳

> 出典: `ft_transcendence.pdf`（Version 21.2）
> 形式: 見出しは `English （日本語）` の1行。本文段落は英文原文の直下に日本語訳。見出し訳がカタカナ外来語のみの場合は括弧なし
> 除外: Chapter I (AI Instructions) の本文のみ。目次上の記載と IV.4 Artificial Intelligence は含む

---

# ft_transcendence

Surprise.

Summary （概要）:

This project involves undertaking tasks you have never done before.
このプロジェクトでは、これまでやったことのない課題に取り組む。

Remember the beginning of your journey in computer science.
コンピュータサイエンスの旅の始まりを思い出せ。

Look at you now; it’s time to shine!
今の自分を見てみろ。輝くときだ！

Version: 21.2

---

# Contents （目次）

I AI Instructions 2

II Preamble （序文）4

II.1 Team Organization and Project Management （チーム構成とプロジェクト管理）4

II.1.1 Required Team Roles （必須のチーム役割）4

II.1.2 Recommended Project Management Practices （推奨されるプロジェクト管理プラクティス）5

III Mandatory part （必須パート）7

III.1 What are we doing? （何をするのか？）7

III.2 General requirements （一般要件）8

III.3 Technical requirements （技術要件）9

IV Modules 10

IV.1 Web 12

IV.2 Accessibility and Internationalization （アクセシビリティと国際化）13

IV.3 User Management （ユーザー管理）14

IV.4 Artificial Intelligence （人工知能）15

IV.5 Cybersecurity 16

IV.6 Gaming and user experience （ゲーミングとユーザー体験）16

IV.7 Devops 18

IV.8 Data and Analytics （データと分析）19

IV.9 Blockchain 20

IV.10 Modules of choice （任意のモジュール）20

V Project Ideas and Examples （プロジェクトのアイデアと例）21

V.1 Example: Building a Pong Game （例: Pongゲームの構築）21

V.2 Gaming Projects （ゲーム系プロジェクト）21

V.3 Social and Collaborative Projects （ソーシャルおよびコラボレーション系プロジェクト）22

V.4 Creative and Media Projects （クリエイティブおよびメディア系プロジェクト）23

V.5 Productivity and Tools Projects （生産性およびツール系プロジェクト）24

V.6 Specialized Projects （特化型プロジェクト）25

VI Readme Requirements （Readme要件）27

VII Bonus part 30

VIII Submission and peer-evaluation （提出とピア評価）31

---

# Chapter II （第II章）

# Preamble （序文）

First of all, congratulations on reaching this milestone! You are now entering the final project of your Common Core, and yes, it will not be easy.

まず第一に、このマイルストーンに到達したことを祝福する。君たちは今、Common Coreの最後のプロジェクトに入ろうとしているが、それは決して簡単なものではない。

Transcendence is a group project (4-5 people), which is intended to boost your creativity, self-confidence, adaptability to new technologies, and teamwork skills.

Transcendenceはグループプロジェクト（4〜5人）であり、創造性、自信、新しいテクノロジーへの適応力、そしてチームワークのスキルを高めることを目的としている。

You’ll create a real-world web application as a team that can move in many directions, depending on the modules you choose and the choices you make. Make sure to think things through together as a team before you start.

チームとして現実世界のWebアプリケーションを作成するが、選択するモジュールや決定事項によって様々な方向へ進む可能性がある。開始する前に、チーム全体で十分に検討すること。

The project is divided into two parts:

プロジェクトは以下の2つのパートに分かれている。

- The mandatory part, which is the fixed core of the project to which every team member must contribute.
- A set of modules, which you can choose and which count toward the final grade.

- 必須パート: プロジェクトの固定されたコアであり、チームメンバー全員が貢献しなければならない。
- モジュール群: 選択可能であり、最終成績に加算される。

This is a long group project. Poor early choices and lack of team coordination will cost a lot of time. Your project and team management will strongly impact your results. All team members must actively participate and contribute to both the mandatory part and the modules.

これは長期のグループプロジェクトである。初期の拙い選択とチーム調整の不足は、多くの時間を浪費する。プロジェクト管理とチーム管理が結果に大きく影響する。全チームメンバーは、必須パートとモジュールの両方に積極的に参加し、貢献しなければならない。

## II.1 Team Organization and Project Management （チーム構成とプロジェクト管理）

As this is a group project, proper team organization is crucial for success. You must establish clear roles and responsibilities from the start.

これはグループプロジェクトであるため、成功には適切なチーム構成が不可欠である。開始時点から明確な役割と責任を確立しなければならない。

### II.1.1 Required Team Roles （必須のチーム役割）

Your team must assign the following roles (one person can have multiple roles if the team has 4 members):

チームは以下の役割を割り当てる必要がある（4人チームの場合、1人が複数の役割を兼任可能）。

- Product Owner (PO): Defines the product vision, prioritizes features, and ensures the project meets user needs.
  - Maintains the product backlog.
  - Makes decisions on features and priorities.
  - Validates completed work.
  - Communicates with stakeholders (evaluators, peers).
- Project Manager (PM) / Scrum Master: Facilitates team coordination and removes obstacles.
  - Organizes team meetings and planning sessions.
  - Tracks progress and deadlines.
  - Ensures team communication.
  - Manages risks and blockers.
- Technical Lead / Architect: Oversees technical decisions and architecture.
  - Defines technical architecture.
  - Makes technology stack decisions.
  - Ensures code quality and best practices.
  - Reviews critical code changes.
- Developers (all team members): Implement features and modules.
  - Write code for assigned features.
  - Participate in code reviews.
  - Test their implementations.
  - Document their work.

- Product Owner (PO): プロダクトのビジョンを定義し、機能の優先順位を決定し、プロジェクトがユーザーのニーズを満たすことを保証する。
  - プロダクトバックログを管理する。
  - 機能と優先順位に関する決定を下す。
  - 完了した作業を検証する。
  - ステークホルダー（評価者、ピア）とコミュニケーションをとる。
- Project Manager (PM) / Scrum Master: チームの調整を促進し、障害を取り除く。
  - チームミーティングと計画セッションを企画する。
  - 進捗と期限を追跡する。
  - チーム内のコミュニケーションを確保する。
  - リスクとブロッカーを管理する。
- Technical Lead / Architect: 技術的な決定とアーキテクチャを監督する。
  - 技術アーキテクチャを定義する。
  - 技術スタックの決定を下す。
  - コードの品質とベストプラクティスを確保する。
  - 重要なコード変更をレビューする。
- Developers（全チームメンバー）: 機能とモジュールを実装する。
  - 割り当てられた機能のコードを書く。
  - コードレビューに参加する。
  - 自身の行った実装をテストする。
  - 自身の作業を文書化する。

Team Size:

チームサイズ:

- 4 people: Some members will have multiple roles (e.g., PM + Developer, PO + Developer).
- 5 people: Roles can be more specialized, with dedicated PO, PM, Tech Lead, and 2 Developers.

- 4人: 一部のメンバーは複数の役割を持つ（例: PM 兼 Developer、PO 兼 Developer）。
- 5人: 専任のPO、PM、Tech Lead、および2人のDeveloperなど、より特化した役割分担が可能である。

All roles must be clearly documented in your README.md.

すべての役割は README.md に明確に文書化されなければならない。

### II.1.2 Recommended Project Management Practices （推奨されるプロジェクト管理プラクティス）

While not mandatory, we strongly recommend implementing some basic project management practices to help your team succeed:

必須ではないが、チームの成功を支援するために、いくつかの基本的なプロジェクト管理プラクティスの導入を強く推奨する。

- Regular communication: Meet regularly (weekly or bi-weekly) to sync on progress and blockers.
- Task organization: Use simple tools like GitHub Issues, Trello, or even a shared document to track who does what.
- Work breakdown: Divide the project into smaller, manageable tasks.
- Code reviews: Try to have at least one other team member review important code changes.
- Documentation: Keep notes of important decisions and how things work.
- Communication channel: Use Discord, Slack, or similar for quick team communication.

- 定期的なコミュニケーション: 定期的（毎週または隔週）に集まり、進捗とブロッカーについて同期する。
- タスク構成: GitHub Issues、Trello、または共有ドキュメントなどのシンプルなツールを使用して、誰が何を行うかを追跡する。
- 作業の細分化: プロジェクトをより小さく、管理しやすいタスクに分割する。
- コードレビュー: 重要なコード変更は、少なくとも他のチームメンバー1名がレビューするように努める。
- 文書化: 重要な決定事項や仕組みについてのメモを残す。
- コミュニケーションチャネル: 迅速なチームコミュニケーションのために、Discord、Slack等を使用する。

These practices are recommendations to help you organize your work. Find what works best for your team! The important thing is that everyone contributes and the work is well-coordinated.

これらは作業を整理するための推奨事項である。チームに最適な方法を見つけること。重要なのは、全員が貢献し、作業がうまく調整されていることである。

During evaluation, the team will be asked to explain:

評価中、チームは以下の説明を求められる。

- How roles were distributed.
- How work was organized and divided.
- How you communicated and coordinated as a team.
- How each member contributed to the project.

- 役割がどのように分配されたか。
- 作業がどのように構成され、分割されたか。
- チームとしてどのようにコミュニケーションを取り、調整したか。
- 各メンバーがプロジェクトにどのように貢献したか。

All team members must be able to explain the project and their contributions.

すべてのチームメンバーは、プロジェクトと自身の貢献について説明できなければならない。

---

# Chapter III （第III章）

# Mandatory part （必須パート）

The project content is up to you. Yes, you have to bring your own ideas and decide together what application to build as a team.

プロジェクトの内容は君たち次第である。独自のアイデアを持ち寄り、どのようなアプリケーションをチームで構築するかを決定しなければならない。

It’s a step forward from what you did previously in the Common Core. You need to think about the project as a whole, not just the features you’re going to implement.

これは以前にCommon Coreで行ったことからのステップアップである。実装する機能だけでなく、プロジェクト全体について考える必要がある。

Of course, you won’t be completely free—there are constraints—but the idea is yours.

もちろん、完全に自由というわけではなく制約はあるが、アイデア自体は君たちのものだ。

## III.1 What are we doing? （何をするのか？）

First, you will have to create a comprehensive README.md file. The detailed requirements for the README are specified in the README Requirements section at the end of this document.

まず、包括的な README.md ファイルを作成する必要がある。READMEの詳細な要件は、このドキュメントの最後にある README Requirements セクションで指定されている。

Project Examples: Your project can take many forms. Here are some valid examples:

プロジェクトの例: プロジェクトは様々な形を取りうる。以下は有効な例である。

- A multiplayer Pong game with tournament system
- A collaborative platform with real-time features
- A social network with user interactions
- An online game (Chess, Tic-Tac-Toe, etc.) with matchmaking
- A project management application
- Any other creative web application that meets the requirements

- トーナメントシステムを備えたマルチプレイヤーPongゲーム
- リアルタイム機能を備えたコラボレーションプラットフォーム
- ユーザーインタラクションを備えたソーシャルネットワーク
- マッチメイキングを備えたオンラインゲーム（チェス、三目並べなど）
- プロジェクト管理アプリケーション
- 要件を満たすその他のクリエイティブなWebアプリケーション

The key is to create something engaging that demonstrates your technical skills and creativity.

重要なのは、技術的なスキルと創造性を示す魅力的なものを作成することである。

## III.2 General requirements （一般要件）

Building an entire project is complicated, and many things can go wrong. To help you, we will provide a list of general requirements that you must follow. If you don’t follow them, your project will be rejected.

プロジェクト全体の構築は複雑であり、多くの問題が発生する可能性がある。そのため、従わなければならない一般要件のリストを提供する。これらに従わない場合、プロジェクトは拒否される。

The requirements are the following:

要件は以下のとおりである。

- The project must be a web application, and requires a frontend, backend, and a database.
- Git must be used with clear and meaningful commit messages. The repository must show:
  - Commits from all team members.
  - Clear commit messages describing the changes.
  - Proper work distribution across the team.
- Deployment must use a containerization solution (Docker, Podman, or equivalent) and run with a single command.
- Your website must be compatible with the latest stable version of Google Chrome.
- No warnings or errors about the Javascript code should appear in the browser console.
- The project must include accessible Privacy Policy and Terms of Service pages with relevant content.

- プロジェクトはWebアプリケーションであり、フロントエンド、バックエンド、およびデータベースが必要である。
- 明確で意味のあるコミットメッセージとともにGitを使用しなければならない。リポジトリは以下を示す必要がある。
  - 全チームメンバーからのコミット。
  - 変更内容を記述した明確なコミットメッセージ。
  - チーム全体での適切な作業分担。
- デプロイはコンテナ化ソリューション（Docker、Podman、または同等のもの）を使用し、単一のコマンドで実行できなければならない。
- Webサイトは、Google Chromeの最新の安定バージョンと互換性がなければならない。
- Javascriptコードに関する警告やエラーがブラウザのコンソールに表示されてはならない。
- プロジェクトには、適切なコンテンツを含む、アクセス可能な Privacy Policy（プライバシーポリシー）および Terms of Service（利用規約）のページが含まれていなければならない。

Privacy Policy and Terms of Service: These pages will be verified during evaluation. They must:

Privacy Policy と Terms of Service: これらのページは評価中に確認される。以下を満たさなければならない。

- Be easily accessible from the application (e.g., footer links).
- Contain relevant and appropriate content for your project.
- Not be placeholder or empty pages.

- アプリケーションから簡単にアクセスできること（例: フッターのリンク）。
- プロジェクトに関連した適切なコンテンツが含まれていること。
- プレースホルダーや空のページではないこと。

Missing or inadequate Privacy Policy/Terms of Service pages will result in project rejection.

Privacy Policy / Terms of Service のページが欠落しているか不適切な場合、プロジェクトは拒否される。

Multi-user Support (Mandatory): Your website must support multiple users simultaneously. This is a core requirement of the project. Users should be able to interact with the application at the same time without conflicts or performance issues. This includes:

マルチユーザーサポート（必須）: Webサイトは複数のユーザーを同時にサポートしなければならない。これはプロジェクトのコア要件である。ユーザーは、競合やパフォーマンスの問題なしに、同時にアプリケーションと対話できなければならない。これには以下が含まれる。

- Multiple users can be logged in and active at the same time.
- Concurrent actions by different users are handled properly.
- Real-time updates are reflected across all connected users when applicable.
- No data corruption or race conditions occur with simultaneous user actions.

- 複数のユーザーが同時にログインしてアクティブになれること。
- 異なるユーザーによる同時アクションが適切に処理されること。
- 該当する場合、リアルタイムの更新がすべての接続ユーザーに反映されること。
- 同時のユーザーアクションによってデータの破損や競合状態が発生しないこと。

## III.3 Technical requirements （技術要件）

This section, like the previous one, is mandatory. You will then be able to choose the modules you want to use in the next chapter.

前のセクションと同様に、このセクションも必須である。その後、次の章で使用するモジュールを選択できるようになる。

- A frontend that is clear, responsive, and accessible across all devices.
- Use a CSS framework or styling solution of your choice (e.g., Tailwind CSS, Bootstrap, Material-UI, Styled Components, etc.).
- Store credentials (API keys, environment variables, etc.) in a local .env file that is ignored by Git, and provide an .env.example file.
- The database must have a clear schema and well-defined relations.
- Your application must have a basic user management system. Users must be able to sign up and log in securely:
  - At minimum: email and password authentication with proper security (hashed passwords, salted, etc.).
  - Additional authentication methods (OAuth, 2FA, etc.) can be implemented via modules.
- All forms and user inputs must be properly validated in both the frontend and backend.
- Any connection to the backend, from a browser, from a script, from an external API, etc., must use HTTPS. Connections inside the backend itself (e.g., web server and database, software inside your container(s)) can be without encryption.

- すべてのデバイスで明確、レスポンシブ、かつアクセスしやすいフロントエンド。
- 任意のCSSフレームワークまたはスタイリングソリューション（Tailwind CSS、Bootstrap、Material-UI、Styled Componentsなど）を使用する。
- 認証情報（APIキー、環境変数など）はGitで無視されるローカルの .env ファイルに保存し、.env.example ファイルを提供する。
- データベースは、明確なスキーマと明確に定義されたリレーションを持っていなければならない。
- アプリケーションには基本的なユーザー管理システムが必要である。ユーザーは安全にサインアップおよびログインできなければならない。
  - 最低限: 適切なセキュリティ（ハッシュ化されたパスワード、ソルトなど）を備えた電子メールとパスワードによる認証。
  - 追加の認証方法（OAuth、2FAなど）はモジュール経由で実装可能である。
- すべてのフォームとユーザー入力は、フロントエンドとバックエンドの両方で適切に検証されなければならない。
- ブラウザ、スクリプト、外部APIなどからのバックエンドへの接続は、すべてHTTPSを使用しなければならない。バックエンド内部の接続（例: Webサーバーとデータベース間、コンテナ内のソフトウェア間）は暗号化なしでもよい。

What is a Framework? For this project, a framework is defined as a comprehensive tool that provides:

フレームワークとは何か？ このプロジェクトにおいて、フレームワークとは以下を提供する包括的なツールと定義される。

- A structured architecture and conventions for organizing code.
- Built-in features for common tasks (routing, state management, etc.).
- A complete ecosystem of tools and libraries.

- コードを整理するための構造化されたアーキテクチャと規約。
- 一般的なタスク（ルーティング、状態管理など）のための組み込み機能。
- ツールとライブラリの完全なエコシステム。

Examples:

例:

- Frontend frameworks: React, Vue, Angular, Svelte, Next.js (these are frameworks).
- Backend frameworks: Express, Fastify, NestJS, Django, Flask, Ruby on Rails.
- Not frameworks: jQuery (library), Lodash (utility library), Axios (HTTP client).

- フロントエンドフレームワーク: React、Vue、Angular、Svelte、Next.js（これらはフレームワークである）。
- バックエンドフレームワーク: Express、Fastify、NestJS、Django、Flask、Ruby on Rails。
- フレームワークではないもの: jQuery（ライブラリ）、Lodash（ユーティリティライブラリ）、Axios（HTTPクライアント）。

Note: React is considered a framework in this context due to its ecosystem and architectural patterns, even though it is technically a library.

注: Reactは技術的にはライブラリであるが、そのエコシステムとアーキテクチャパターンのため、この文脈ではフレームワークと見なされる。

---

# Chapter IV （第IV章）

# Modules

You will need to earn 14 points in total to complete your project. Each major module is worth 2 points, and each minor module is worth 1 point.

プロジェクトを完了するには、合計で14ポイントを獲得する必要がある。各 Major モジュールは2ポイント、各 Minor モジュールは1ポイントである。

The following categories are available. You may choose multiple modules from any category:

以下のカテゴリが利用可能である。任意のカテゴリから複数のモジュールを選択できる。

- Web
- Accessibility and Internationalization
- User Management
- Artificial Intelligence
- Cybersecurity
- Gaming and user experience
- Devops
- Data and Analytics
- Blockchain
- Modules of choice

- Web
- Accessibility and Internationalization（アクセシビリティと国際化）
- User Management（ユーザー管理）
- Artificial Intelligence（人工知能）
- Cybersecurity（サイバーセキュリティ）
- Gaming and user experience（ゲーミングとユーザー体験）
- Devops
- Data and Analytics（データと分析）
- Blockchain（ブロックチェーン）
- Modules of choice（任意のモジュール）

We strongly recommend choosing modules only after your ideas are clear and you have a good understanding of what you want to build.

アイデアが明確になり、何を構築したいかを十分に理解してからモジュールを選択することを強く推奨する。

Additionally, aiming for more than 14 points in total may be a good idea, especially if some modules aren’t validated during the evaluation.

また、評価中に一部のモジュールが検証されない場合に備えて、合計14ポイント以上を目指すのが良いアイデアである。

Important - Module Dependencies and Evaluation:

重要 — モジュールの依存関係と評価:

- Some modules require other modules to be implemented first (marked with info notes).
- Gaming modules (AI Opponent, Tournament, Game customization, Spectator mode, Multiplayer 3+, Add another game) require that at least one game be implemented first.
- The Game Statistics module requires that a game be implemented.
- Advanced chat features require the basic chat functionality from the "User interaction" module.
- SSR is incompatible with the ICP blockchain backend.
- Plan your modules carefully to ensure they work together coherently!
- During evaluation: You will be asked to demonstrate each claimed module. Only fully functional and properly implemented modules will be counted toward your final score. Non-functional or incomplete modules = 0 points.

- 一部のモジュールは、他のモジュールを先に実装する必要がある（情報ノートでマークされている）。
- ゲーミングモジュール（AI Opponent、Tournament、Game customization、Spectator mode、Multiplayer 3+、Add another game）は、少なくとも1つのゲームが先に実装されている必要がある。
- Game Statistics（ゲーム統計）モジュールは、ゲームが実装されている必要がある。
- 高度なチャット機能は、「User interaction」モジュールの基本的なチャット機能を必要とする。
- SSRはICPブロックチェーンバックエンドと互換性がない。
- モジュールが首尾一貫して連携して機能するよう、慎重に計画すること。
- 評価中: 申告した各モジュールのデモを求められる。完全に機能し、適切に実装されたモジュールのみが最終スコアにカウントされる。機能しない、または不完全なモジュールは0ポイントとなる。

## IV.1 Web

- Major: Use a framework for both the frontend and backend.
  - Use a frontend framework (React, Vue, Angular, Svelte, etc.).
  - Use a backend framework (Express, NestJS, Django, Flask, Ruby on Rails, etc.).
  - Full-stack frameworks (Next.js, Nuxt.js, SvelteKit) count as both if you use both their frontend and backend capabilities.
- Minor: Use a frontend framework (React, Vue, Angular, Svelte, etc.).
- Minor: Use a backend framework (Express, Fastify, NestJS, Django, etc.).
- Major: Implement real-time features using WebSockets or similar technology.
  - Real-time updates across clients.
  - Handle connection/disconnection gracefully.
  - Efficient message broadcasting.
- Major: Allow users to interact with other users. The minimum requirements are:
  - A basic chat system (send/receive messages between users).
  - A profile system (view user information).
  - A friends system (add/remove friends, see friends list).
- Major: A public API to interact with the database with a secured API key, rate limiting, documentation, and at least 5 endpoints:
  - GET /api/{something}
  - POST /api/{something}
  - PUT /api/{something}
  - DELETE /api/{something}
- Minor: Use an ORM for the database.
- Minor: A complete notification system for all creation, update, and deletion actions.
- Minor: Real-time collaborative features (shared workspaces, live editing, collaborative drawing, etc.).
- Minor: Server-Side Rendering (SSR) for improved performance and SEO.
- Minor: Progressive Web App (PWA) with offline support and installability.
- Minor: Custom-made design system with reusable components, including a proper color palette, typography, and icons (minimum: 10 reusable components).
- Minor: Implement advanced search functionality with filters, sorting, and pagination.
- Minor: File upload and management system.
  - Support multiple file types (images, documents, etc.).
  - Client-side and server-side validation (type, size, format).
  - Secure file storage with proper access control.
  - File preview functionality where applicable.
  - Progress indicators for uploads.
  - Ability to delete uploaded files.

- Major: フロントエンドとバックエンドの両方でフレームワークを使用する。
  - フロントエンドフレームワークを使用する（React、Vue、Angular、Svelteなど）。
  - バックエンドフレームワークを使用する（Express、NestJS、Django、Flask、Ruby on Railsなど）。
  - フルスタックフレームワーク（Next.js、Nuxt.js、SvelteKit）のフロントエンドとバックエンドの両方の機能を使用する場合、両方としてカウントされる。
- Minor: フロントエンドフレームワークを使用する（React、Vue、Angular、Svelteなど）。
- Minor: バックエンドフレームワークを使用する（Express、Fastify、NestJS、Djangoなど）。
- Major: WebSocketsまたは類似技術を使用してリアルタイム機能を実装する。
  - クライアント間のリアルタイム更新。
  - 接続/切断を適切に処理する。
  - 効率的なメッセージブロードキャスト。
- Major: ユーザーが他のユーザーと対話できるようにする。最低要件は以下である。
  - 基本的なチャットシステム（ユーザー間のメッセージ送受信）。
  - プロファイルシステム（ユーザー情報の閲覧）。
  - フレンドシステム（フレンドの追加/削除、フレンドリストの表示）。
- Major: セキュアなAPIキー、レート制限、ドキュメント、および少なくとも5つのエンドポイントを備えた、データベースと対話する公開API。
  - GET /api/{something}
  - POST /api/{something}
  - PUT /api/{something}
  - DELETE /api/{something}
- Minor: データベースにORMを使用する。
- Minor: すべての作成、更新、削除アクションに対する完全な通知システム。
- Minor: リアルタイムコラボレーション機能（共有ワークスペース、ライブ編集、共同描画など）。
- Minor: パフォーマンスとSEO向上のためのサーバーサイドレンダリング（SSR）。
- Minor: オフラインサポートとインストール機能を備えたプログレッシブWebアプリ（PWA）。
- Minor: 再利用可能なコンポーネント、適切なカラーパレット、タイポグラフィ、アイコンを含むカスタムメイドのデザインシステム（最小: 再利用可能コンポーネント10個）。
- Minor: フィルター、ソート、ページネーションを備えた高度な検索機能を実装する。
- Minor: ファイルのアップロードと管理システム。
  - 複数のファイルタイプ（画像、ドキュメントなど）をサポートする。
  - クライアント側およびサーバー側の検証（タイプ、サイズ、形式）。
  - 適切なアクセス制御を備えた安全なファイルストレージ。
  - 該当する場合のファイルプレビュー機能。
  - アップロードの進行状況インジケータ。
  - アップロード済みファイルを削除する機能。

## IV.2 Accessibility and Internationalization （アクセシビリティと国際化）

- Major: Complete accessibility compliance (WCAG 2.1 AA) with screen reader support, keyboard navigation, and assistive technologies.
- Minor: Support for multiple languages (at least 3 languages).
  - Implement i18n (internationalization) system.
  - At least 3 complete language translations.
  - Language switcher in the UI.
  - All user-facing text must be translatable.
- Minor: Right-to-left (RTL) language support.
  - Support for at least one RTL language (Arabic, Hebrew, etc.).
  - Complete layout mirroring (not just text direction).
  - RTL-specific UI adjustments where needed.
  - Seamless switching between LTR and RTL.
- Minor: Support for additional browsers.
  - Full compatibility with at least 2 additional browsers (Firefox, Safari, Edge, etc.).
  - Test and fix all features in each browser.
  - Document any browser-specific limitations.
  - Consistent UI/UX across all supported browsers.

- Major: 完全なアクセシビリティへの準拠（WCAG 2.1 AA）。スクリーンリーダー、キーボードナビゲーション、支援技術を含む。
- Minor: 多言語のサポート（少なくとも3言語）。
  - i18n（国際化）システムを実装する。
  - 少なくとも3言語の完全な翻訳。
  - UI内の言語スイッチャー。
  - ユーザー向けのすべてのテキストが翻訳可能でなければならない。
- Minor: 右から左へ読む言語（RTL）のサポート。
  - 少なくとも1つのRTL言語（アラビア語、ヘブライ語など）のサポート。
  - 完全なレイアウトミラーリング（テキスト方向だけでなく）。
  - 必要に応じたRTL固有のUI調整。
  - LTRとRTLのシームレスな切り替え。
- Minor: 追加ブラウザのサポート。
  - 少なくとも2つの追加ブラウザ（Firefox、Safari、Edgeなど）との完全な互換性。
  - 各ブラウザですべての機能をテストし、修正する。
  - ブラウザ固有の制限があれば文書化する。
  - サポートするすべてのブラウザで一貫したUI/UX。

## IV.3 User Management （ユーザー管理）

- Major: Standard user management and authentication.
  - Users can update their profile information.
  - Users can upload an avatar (with a default avatar if none provided).
  - Users can add other users as friends and see their online status.
  - Users have a profile page displaying their information.
- Minor: Game statistics and match history (requires a game module).
  - Track user game statistics (wins, losses, ranking, level, etc.).
  - Display match history (1v1 games, dates, results, opponents).
  - Show achievements and progression.
  - Leaderboard integration.

- Major: 標準的なユーザー管理と認証。
  - ユーザーはプロファイル情報を更新できる。
  - ユーザーはアバターをアップロードできる（未設定の場合はデフォルトアバター）。
  - ユーザーは他のユーザーをフレンドとして追加し、オンライン状態を確認できる。
  - ユーザーは自身の情報を表示するプロファイルページを持つ。
- Minor: ゲーム統計と対戦履歴（ゲームモジュールが必要）。
  - ユーザーのゲーム統計（勝ち、負け、ランキング、レベルなど）を追跡する。
  - 対戦履歴を表示する（1v1ゲーム、日付、結果、対戦相手）。
  - 実績と進行状況を表示する。
  - リーダーボードとの連携。

This module requires you to have implemented at least one game (see "Gaming and user experience" section). You cannot claim this module without a functional game.

このモジュールを申告するには、少なくとも1つのゲームを実装している必要がある（「Gaming and user experience」セクションを参照）。機能するゲームなしではこのモジュールを申告できない。

- Minor: Implement remote authentication with OAuth 2.0 (Google, GitHub, 42, etc.).
- Major: Advanced permissions system:
  - View, edit, and delete users (CRUD).
  - Roles management (admin, user, guest, moderator, etc.).
  - Different views and actions based on user role.
- Major: An organization system:
  - Create, edit, and delete organizations.
  - Add users to organizations.
  - Remove users from organizations.
  - View organizations and allow users to perform specific actions within an organization (minimum: create, read, update).
- Minor: Implement a complete 2FA (Two-Factor Authentication) system for the users.
- Minor: User activity analytics and insights dashboard.

- Minor: OAuth 2.0（Google、GitHub、42など）によるリモート認証を実装する。
- Major: 高度な権限システム:
  - ユーザーの閲覧、編集、削除（CRUD）。
  - 役割管理（admin、user、guest、moderatorなど）。
  - ユーザーの役割に基づく異なるビューとアクション。
- Major: 組織システム:
  - 組織の作成、編集、削除。
  - 組織へのユーザー追加。
  - 組織からのユーザー削除。
  - 組織の閲覧と、組織内での特定アクションの実行（最低: create、read、update）。
- Minor: ユーザー向けの完全な2FA（二要素認証）システムを実装する。
- Minor: ユーザーアクティビティの分析とインサイトダッシュボード。

## IV.4 Artificial Intelligence （人工知能）

- Major: Introduce an AI Opponent for games.
  - The AI must be challenging and able to win occasionally.
  - The AI should simulate human-like behavior (not perfect play).
  - If you implement game customization options, the AI must be able to use them.
  - You must be able to explain your AI implementation during evaluation.

- Major: ゲームにAIの対戦相手を導入する。
  - AIは挑戦的であり、時折勝利できなければならない。
  - AIは人間らしい行動をシミュレートすべきである（完璧なプレイではない）。
  - ゲームのカスタマイズオプションを実装する場合、AIはそれらを使用できなければならない。
  - 評価中に自身のAI実装を説明できなければならない。

This module requires you to have implemented at least one game (see "Gaming and user experience" section). The AI must be able to play your game competently.

このモジュールを申告するには、少なくとも1つのゲームを実装している必要がある（「Gaming and user experience」セクションを参照）。AIはゲームを十分にプレイできなければならない。

- Major: Implement a complete RAG (Retrieval-Augmented Generation) system.
  - Interact with a large dataset of information.
  - Users can ask questions and get relevant answers.
  - Implement proper context retrieval and response generation.
- Major: Implement a complete LLM system interface.
  - Generate text and/or images based on user input.
  - Handle streaming responses properly.
  - Implement error handling and rate limiting.
- Major: Recommendation system using machine learning.
  - Personalized recommendations based on user behavior.
  - Collaborative filtering or content-based filtering.
  - Continuously improve recommendations over time.
- Minor: Content moderation AI (auto moderation, auto deletion, auto warning, etc.)
- Minor: Voice/speech integration for accessibility or interaction.
- Minor: Sentiment analysis for user-generated content.
- Minor: Image recognition and tagging system.

- Major: 完全なRAG（Retrieval-Augmented Generation）システムを実装する。
  - 大規模な情報データセットと対話する。
  - ユーザーは質問をし、関連する回答を得られる。
  - 適切なコンテキスト検索と応答生成を実装する。
- Major: 完全なLLMシステムインターフェースを実装する。
  - ユーザー入力に基づいてテキストおよび/または画像を生成する。
  - ストリーミング応答を適切に処理する。
  - エラーハンドリングとレート制限を実装する。
- Major: 機械学習を使用した推奨システム。
  - ユーザー行動に基づくパーソナライズされた推奨。
  - 協調フィルタリングまたはコンテンツベースフィルタリング。
  - 時間とともに推奨を継続的に改善する。
- Minor: コンテンツモデレーションAI（自動モデレーション、自動削除、自動警告など）。
- Minor: アクセシビリティまたはインタラクションのための音声/スピーチ統合。
- Minor: ユーザー生成コンテンツの感情分析。
- Minor: 画像認識およびタグ付けシステム。

## IV.5 Cybersecurity

- Major: Implement WAF/ModSecurity (hardened) + HashiCorp Vault for secrets:
  - Configure strict ModSecurity/WAF.
  - Manage secrets in Vault (API keys, credentials, environment variables), encrypted and isolated.

- Major: WAF/ModSecurity（ハードニング済み）+ シークレット用 HashiCorp Vault を実装する。
  - 厳格な ModSecurity/WAF を設定する。
  - Vaultでシークレット（APIキー、認証情報、環境変数）を管理し、暗号化および隔離する。

## IV.6 Gaming and user experience （ゲーミングとユーザー体験）

- Major: Implement a complete web-based game where users can play against each other.
  - The game can be real-time multiplayer (e.g., Pong, Chess, Tic-Tac-Toe, Card games, etc.).
  - Players must be able to play live matches.
  - The game must have clear rules and win/loss conditions.
  - The game can be 2D or 3D.
- Major: Remote players — Enable two players on separate computers to play the same game in real-time.
  - Handle network latency and disconnections gracefully.
  - Provide a smooth user experience for remote gameplay.
  - Implement reconnection logic.
- Major: Multiplayer game (more than two players).
  - Support for three or more players simultaneously.
  - Fair gameplay mechanics for all participants.
  - Proper synchronization across all clients.

- Major: ユーザー同士が対戦できる完全なWebベースのゲームを実装する。
  - ゲームはリアルタイムマルチプレイヤーでもよい（例: Pong、チェス、三目並べ、カードゲームなど）。
  - プレイヤーはライブマッチをプレイできなければならない。
  - ゲームには明確なルールと勝敗条件がなければならない。
  - ゲームは2Dでも3Dでもよい。
- Major: リモートプレイヤー — 別々のコンピュータ上の2人のプレイヤーが、同じゲームをリアルタイムでプレイできるようにする。
  - ネットワーク遅延と切断を適切に処理する。
  - リモートプレイのためのスムーズなユーザー体験を提供する。
  - 再接続ロジックを実装する。
- Major: マルチプレイヤーゲーム（2人より多い）。
  - 3人以上のプレイヤーを同時にサポートする。
  - 全参加者に対する公平なゲームプレイメカニクス。
  - 全クライアント間の適切な同期。

This module requires you to have implemented at least one game (see "Gaming and user experience" section). You’re extending your game to support three or more players.

このモジュールを申告するには、少なくとも1つのゲームを実装している必要がある（「Gaming and user experience」セクションを参照）。既存のゲームを3人以上に拡張するものである。

- Major: Add another game with user history and matchmaking.
  - Implement a second distinct game.
  - Track user history and statistics for this game.
  - Implement a matchmaking system.
  - Maintain performance and responsiveness.

- Major: ユーザー履歴とマッチメイキングを備えた別のゲームを追加する。
  - 2つ目の異なるゲームを実装する。
  - このゲームのユーザー履歴と統計を追跡する。
  - マッチメイキングシステムを実装する。
  - パフォーマンスと応答性を維持する。

This module requires you to have already implemented a first game (see "Implement a complete web-based game" module above). You cannot claim this module without having a functional first game.

このモジュールを申告するには、最初のゲームをすでに実装している必要がある（上記の「完全なWebベースのゲームを実装する」モジュールを参照）。機能する最初のゲームなしではこのモジュールを申告できない。

- Major: Implement advanced 3D graphics using a library like Three.js or Babylon.js.
  - Create an immersive 3D environment.
  - Implement advanced rendering techniques.
  - Ensure smooth performance and user interaction.
- Minor: Advanced chat features (enhances the basic chat from "User interaction" module).
  - Ability to block users from messaging you.
  - Invite users to play games directly from chat.
  - Game/tournament notifications in chat.
  - Access to user profiles from chat interface.
  - Chat history persistence.
  - Typing indicators and read receipts.

- Major: Three.jsやBabylon.jsなどのライブラリを使用して高度な3Dグラフィックスを実装する。
  - 没入感のある3D環境を作成する。
  - 高度なレンダリング技術を実装する。
  - スムーズなパフォーマンスとユーザーインタラクションを確保する。
- Minor: 高度なチャット機能（「User interaction」モジュールの基本チャットを拡張する）。
  - メッセージを送ってくるユーザーをブロックする機能。
  - チャットから直接ゲームに招待する機能。
  - チャット内のゲーム/トーナメント通知。
  - チャットインターフェースからユーザープロファイルへアクセス。
  - チャット履歴の永続化。
  - 入力中インジケータと既読表示。

This module enhances the basic chat system from the "Allow users to interact" module. You cannot claim this module without having implemented the basic chat first.

このモジュールは、「Allow users to interact」モジュールの基本チャットシステムを拡張するものである。基本チャットを先に実装していなければ、このモジュールを申告できない。

- Minor: Implement a tournament system.
  - Clear matchup order and bracket system.
  - Track who plays against whom.
  - Matchmaking system for tournament participants.
  - Tournament registration and management.

- Minor: トーナメントシステムを実装する。
  - 明確な対戦順とブラケットシステム。
  - 誰が誰と対戦するかを追跡する。
  - トーナメント参加者向けのマッチメイキングシステム。
  - トーナメントの登録と管理。

This module requires you to have implemented at least one game (see "Gaming and user experience" section). You cannot have tournaments without a game to play.

このモジュールを申告するには、少なくとも1つのゲームを実装している必要がある（「Gaming and user experience」セクションを参照）。プレイするゲームがなければトーナメントは成立しない。

- Minor: Game customization options.
  - Power-ups, attacks, or special abilities.
  - Different maps or themes.
  - Customizable game settings.
  - Default options must be available.

- Minor: ゲームのカスタマイズオプション。
  - パワーアップ、攻撃、または特殊能力。
  - 異なるマップまたはテーマ。
  - カスタマイズ可能なゲーム設定。
  - デフォルトオプションが利用可能でなければならない。

This module requires you to have implemented at least one game (see "Gaming and user experience" section). You’re adding customization to an existing game.

このモジュールを申告するには、少なくとも1つのゲームを実装している必要がある（「Gaming and user experience」セクションを参照）。既存のゲームにカスタマイズを追加するものである。

- Minor: A gamification system to reward users for their actions.
  - Implement at least 3 of the following: achievements, badges, leaderboards, XP/level system, daily challenges, rewards
  - System must be persistent (stored in database)
  - Visual feedback for users (notifications, progress bars, etc.)
  - Clear rules and progression mechanics

- Minor: ユーザーの行動に応じて報酬を与えるゲーミフィケーションシステム。
  - 以下のうち少なくとも3つを実装する: 実績、バッジ、リーダーボード、XP/レベルシステム、デイリーチャレンジ、報酬
  - システムは永続的でなければならない（データベースに保存）
  - ユーザーへの視覚的フィードバック（通知、プログレスバーなど）
  - 明確なルールと進行メカニクス

While this is a Minor module (1 point), implementing a complete gamification system can be substantial. Focus on quality over quantity—three well-implemented features are better than six poorly done ones.

これはMinorモジュール（1ポイント）であるが、完全なゲーミフィケーションシステムの実装は相当な作業になりうる。量より質を重視すること。よく実装された3つの機能の方が、雑に作られた6つより優れている。

- Minor: Implement spectator mode for games.
  - Allow users to watch ongoing games.
  - Real-time updates for spectators.
  - Optional: spectator chat.

- Minor: ゲームの観戦者（スペクテーター）モードを実装する。
  - 進行中のゲームをユーザーが視聴できるようにする。
  - 観戦者向けのリアルタイム更新。
  - 任意: 観戦者チャット。

This module requires you to have implemented at least one game (see "Gaming and user experience" section). Spectators need a game to watch.

このモジュールを申告するには、少なくとも1つのゲームを実装している必要がある（「Gaming and user experience」セクションを参照）。観戦者には視聴するゲームが必要である。

## IV.7 Devops

- Major: Infrastructure for log management using ELK (Elasticsearch, Logstash, Kibana).
  - Elasticsearch to store and index logs.
  - Logstash to collect and transform logs.
  - Kibana for visualization and dashboards.
  - Implement log retention and archiving policies.
  - Secure access to all components.
- Major: Monitoring system with Prometheus and Grafana.
  - Set up Prometheus to collect metrics.
  - Configure exporters and integrations.
  - Create custom Grafana dashboards.
  - Set up alerting rules.
  - Secure access to Grafana.
- Major: Backend as microservices.
  - Design loosely-coupled services with clear interfaces.
  - Use REST APIs or message queues for communication.
  - Each service should have a single responsibility.
- Minor: Health check and status page system with automated backups and disaster recovery procedures.

- Major: ELK（Elasticsearch、Logstash、Kibana）を使用したログ管理インフラストラクチャ。
  - ログの保存とインデックス作成のためのElasticsearch。
  - ログの収集と変換のためのLogstash。
  - 可視化とダッシュボードのためのKibana。
  - ログの保持およびアーカイブポリシーを実装する。
  - 全コンポーネントへのセキュアなアクセス。
- Major: PrometheusとGrafanaを使用した監視システム。
  - メトリクス収集のためにPrometheusをセットアップする。
  - エクスポーターとインテグレーションを設定する。
  - カスタムGrafanaダッシュボードを作成する。
  - アラートルールを設定する。
  - Grafanaへのセキュアなアクセス。
- Major: マイクロサービスとしてのバックエンド。
  - 明確なインターフェースを持つ疎結合なサービスを設計する。
  - 通信にREST APIまたはメッセージキューを使用する。
  - 各サービスは単一責任を持つべきである。
- Minor: 自動バックアップと災害復旧手順を備えた、ヘルスチェックおよびステータスページシステム。

## IV.8 Data and Analytics （データと分析）

- Major: Advanced analytics dashboard with data visualization.
  - Interactive charts and graphs (line, bar, pie, etc.).
  - Real-time data updates.
  - Export functionality (PDF, CSV, etc.).
  - Customizable date ranges and filters.
- Minor: Data export and import functionality.
  - Export data in multiple formats (JSON, CSV, XML, etc.).
  - Import data with validation.
  - Bulk operations support.
- Minor: GDPR compliance features.
  - Allow users to request their data.
  - Data deletion with confirmation.
  - Export user data in a readable format.
  - Confirmation emails for data operations.

- Major: データ視覚化を備えた高度な分析ダッシュボード。
  - インタラクティブなチャートとグラフ（折れ線、棒、円など）。
  - リアルタイムデータ更新。
  - エクスポート機能（PDF、CSVなど）。
  - カスタマイズ可能な日付範囲とフィルター。
- Minor: データのエクスポートとインポート機能。
  - 複数形式でのデータエクスポート（JSON、CSV、XMLなど）。
  - 検証付きのデータインポート。
  - 一括操作のサポート。
- Minor: GDPR準拠機能。
  - ユーザーが自身のデータを要求できるようにする。
  - 確認付きのデータ削除。
  - 可読形式でのユーザーデータのエクスポート。
  - データ操作に関する確認メール。

## IV.9 Blockchain

- Major: Store tournament scores on the Blockchain.
  - Use Avalanche and Solidity smart contracts on a test blockchain.
  - Implement smart contracts to record, manage, and retrieve tournament scores.
  - Ensure data integrity and immutability.
- Minor: Use ICP (Internet Computer Protocol) for a backend that runs on a blockchain (incompatible with SSR).

- Major: トーナメントのスコアをブロックチェーンに保存する。
  - テストブロックチェーン上でAvalancheとSolidityスマートコントラクトを使用する。
  - トーナメントスコアを記録、管理、取得するスマートコントラクトを実装する。
  - データの完全性と不変性を確保する。
- Minor: ブロックチェーン上で動作するバックエンドにICP（Internet Computer Protocol）を使用する（SSRと非互換）。

## IV.10 Modules of choice （任意のモジュール）

- Major: Implement a custom module that is not listed above.
  - The module must be substantial and demonstrate technical complexity.
  - You must provide proper justification in your README.md explaining:
    - Why you chose this module.
    - What technical challenges it addresses.
    - How it adds value to your project.
    - Why it deserves Major module status (2 points).
  - Taking shortcuts or implementing trivial features will result in rejection.
  - Be creative and think outside the box.
  - The module should be relevant to your project context.
- Minor: Same as the major module but smaller in scope and less complex.
  - Must still demonstrate technical skill and creativity.
  - Should add meaningful value to your project.
  - Requires justification in README.md (similar to Major, but for 1 point).

- Major: 上記にリストされていないカスタムモジュールを実装する。
  - モジュールは実質的であり、技術的複雑さを示さなければならない。
  - README.md に適切な正当化を記載し、以下を説明しなければならない。
    - なぜこのモジュールを選んだか。
    - どのような技術的課題に対処するか。
    - プロジェクトにどのように価値を加えるか。
    - なぜ Major モジュール（2ポイント）に値するか。
  - 近道を取ったり、些細な機能を実装したりすると拒否される。
  - 創造的に考え、枠にとらわれないこと。
  - モジュールはプロジェクトの文脈に関連しているべきである。
- Minor: Majorモジュールと同じだが、スコープが小さく、複雑さが少ないもの。
  - それでも技術的スキルと創造性を示さなければならない。
  - プロジェクトに意味のある価値を加えるべきである。
  - README.md での正当化が必要である（Majorと同様だが、1ポイント分）。

---

# Chapter V （第V章）

# Project Ideas and Examples （プロジェクトのアイデアと例）

To help you get started and inspire your creativity, this chapter provides concrete project ideas and examples of how to reach the required 14 points. Remember, these are just suggestions — feel free to be creative and come up with your own unique ideas!

作業を開始し、創造性を刺激するための助けとして、この章では必要な14ポイントに到達するための具体的なプロジェクトのアイデアと例を提供する。これらは単なる提案である。独自のアイデアを考え出して構わない。

## V.1 Example: Building a Pong Game （例: Pongゲームの構築）

If you choose to create a Pong game (like the original project), here’s how you can reach 14 points:

Pongゲーム（元のプロジェクトのようなもの）を作成する場合、以下のようにして14ポイントに到達できる。

- Gaming and user experience: Web-based game (2pts) + Remote players (2pts) + Tournament system (1pt) + Game customization (1pt) = 6 points
- User Management: Standard user management (2pts) + OAuth (1pt) = 3 points
- Web: Use frameworks (frontend + backend = 2pts) + ORM (1pt) = 3 points
- Artificial Intelligence: AI Opponent (2pts) = 2 points

- Gaming and user experience: Web-based game（2ポイント）+ Remote players（2ポイント）+ Tournament system（1ポイント）+ Game customization（1ポイント）= 6ポイント
- User Management: Standard user management（2ポイント）+ OAuth（1ポイント）= 3ポイント
- Web: Use frameworks（frontend + backend = 2ポイント）+ ORM（1ポイント）= 3ポイント
- Artificial Intelligence: AI Opponent（2ポイント）= 2ポイント

Total: 14 points

合計: 14ポイント

This is just one example. You can mix and match modules from different categories to create your own unique project. The key is to ensure that your modules work together coherently and add value to your application.

これは一例にすぎない。異なるカテゴリからモジュールを組み合わせて、独自のプロジェクトを作成できる。重要なのは、モジュールが首尾一貫して連携し、アプリケーションに価値を加えることである。

## V.2 Gaming Projects （ゲーム系プロジェクト）

These projects focus on interactive gameplay and user competition:

これらのプロジェクトは、インタラクティブなゲームプレイとユーザー間の競争に焦点を当てる。

- Multiplayer Pong: Classic Pong with tournaments, remote play, AI opponents, and power-ups.
  - Suggested modules: Web-based game, Remote players, Tournament system, AI Opponent, Game customization
  - Point potential: 14+ points
- Online Chess Platform: Real-time chess with matchmaking, ELO rating, game analysis, and spectator mode.
  - Suggested modules: Web-based game, Remote players, AI Opponent, Spectator mode, Game statistics
  - Point potential: 15+ points
- Card Game Arena: Multiplayer card games (Poker, Uno, etc.) with tournaments and leaderboards.
  - Suggested modules: Web-based game, Multiplayer 3+, Tournament system, Gamification
  - Point potential: 14+ points
- Battle Royale Mini-Game: Simple browser-based battle royale game with multiple players.
  - Suggested modules: Web-based game, Multiplayer 3+, Real-time features, Game customization
  - Point potential: 14+ points
- Trivia/Quiz Platform: Real-time multiplayer quiz game with categories and tournaments.
  - Suggested modules: Web-based game, Multiplayer 3+, Tournament system, Gamification, Analytics dashboard
  - Point potential: 15+ points

- Multiplayer Pong: トーナメント、リモートプレイ、AI対戦相手、パワーアップを備えたクラシックPong。
  - 推奨モジュール: Web-based game、Remote players、Tournament system、AI Opponent、Game customization
  - ポイント見込み: 14+ points
- Online Chess Platform: マッチメイキング、ELOレーティング、ゲーム分析、観戦モードを備えたリアルタイムチェス。
  - 推奨モジュール: Web-based game、Remote players、AI Opponent、Spectator mode、Game statistics
  - ポイント見込み: 15+ points
- Card Game Arena: トーナメントとリーダーボードを備えたマルチプレイヤーカードゲーム（ポーカー、Unoなど）。
  - 推奨モジュール: Web-based game、Multiplayer 3+、Tournament system、Gamification
  - ポイント見込み: 14+ points
- Battle Royale Mini-Game: 複数プレイヤー対応のシンプルなブラウザベース・バトルロイヤルゲーム。
  - 推奨モジュール: Web-based game、Multiplayer 3+、Real-time features、Game customization
  - ポイント見込み: 14+ points
- Trivia/Quiz Platform: カテゴリとトーナメントを備えたリアルタイムマルチプレイヤークイズゲーム。
  - 推奨モジュール: Web-based game、Multiplayer 3+、Tournament system、Gamification、Analytics dashboard
  - ポイント見込み: 15+ points

## V.3 Social and Collaborative Projects （ソーシャルおよびコラボレーション系プロジェクト）

These projects emphasize user interaction and community building:

これらのプロジェクトは、ユーザーインタラクションとコミュニティ構築を重視する。

- Social Network: User profiles, posts, comments, likes, friends, real-time chat, and notifications.
  - Suggested modules: User interaction, Real-time features, Notification system, Advanced chat, File upload
  - Point potential: 14+ points
- Collaborative Workspace: Real-time document editing, project management, team chat, and file sharing.
  - Suggested modules: Real-time collaborative features, User interaction, Organization system, File upload, Advanced permissions
  - Point potential: 15+ points
- Forum Platform: Discussion boards with categories, threads, moderation tools, and user reputation systems.
  - Suggested modules: User interaction, Advanced permissions, Gamification, Content moderation AI, Advanced search
  - Point potential: 14+ points
- Event Management Platform: Create and manage events, RSVP system, calendar integration, and notifications.
  - Suggested modules: User interaction, Notification system, Organization system, Public API, Advanced search
  - Point potential: 14+ points
- Learning Management System: Courses, assignments, quizzes, progress tracking, and student-teacher interaction.
  - Suggested modules: User interaction, Organization system, Advanced permissions, File upload, Analytics dashboard
  - Point potential: 15+ points

- Social Network: ユーザープロファイル、投稿、コメント、いいね、フレンド、リアルタイムチャット、通知。
  - 推奨モジュール: User interaction、Real-time features、Notification system、Advanced chat、File upload
  - ポイント見込み: 14+ points
- Collaborative Workspace: リアルタイム文書編集、プロジェクト管理、チームチャット、ファイル共有。
  - 推奨モジュール: Real-time collaborative features、User interaction、Organization system、File upload、Advanced permissions
  - ポイント見込み: 15+ points
- Forum Platform: カテゴリ、スレッド、モデレーションツール、ユーザー評判システムを備えた掲示板。
  - 推奨モジュール: User interaction、Advanced permissions、Gamification、Content moderation AI、Advanced search
  - ポイント見込み: 14+ points
- Event Management Platform: イベントの作成・管理、RSVPシステム、カレンダー連携、通知。
  - 推奨モジュール: User interaction、Notification system、Organization system、Public API、Advanced search
  - ポイント見込み: 14+ points
- Learning Management System: コース、課題、クイズ、進捗追跡、学生と教師のインタラクション。
  - 推奨モジュール: User interaction、Organization system、Advanced permissions、File upload、Analytics dashboard
  - ポイント見込み: 15+ points

## V.4 Creative and Media Projects （クリエイティブおよびメディア系プロジェクト）

These projects focus on content creation and sharing:

これらのプロジェクトは、コンテンツの作成と共有に焦点を当てる。

- Music Streaming Platform: Upload and stream music, playlists, recommendations, and social features.
  - Suggested modules: File upload, User interaction, Recommendation system, Advanced search, Analytics dashboard
  - Point potential: 15+ points
- Video Sharing Platform: Upload and watch videos, comments, likes, subscriptions, and recommendations.
  - Suggested modules: File upload, User interaction, Recommendation system, Content moderation AI, Advanced search
  - Point potential: 16+ points
- Art Gallery: Share artwork in galleries, with comments, likes, and artist profiles.
  - Suggested modules: File upload, User interaction, Image recognition, Advanced search, Custom design system
  - Point potential: 14+ points
- Blogging Platform: Create and publish blogs, with comments, tags, categories, and reader engagement.
  - Suggested modules: User interaction, SSR, Advanced search, Sentiment analysis, Multiple languages
  - Point potential: 14+ points
- Recipe Sharing Platform: Share recipes, ratings, comments, meal planning, and shopping lists.
  - Suggested modules: User interaction, File upload, Advanced search, Recommendation system, PWA
  - Point potential: 14+ points

- Music Streaming Platform: 音楽のアップロードとストリーミング、プレイリスト、推奨、ソーシャル機能。
  - 推奨モジュール: File upload、User interaction、Recommendation system、Advanced search、Analytics dashboard
  - ポイント見込み: 15+ points
- Video Sharing Platform: 動画のアップロードと視聴、コメント、いいね、購読、推奨。
  - 推奨モジュール: File upload、User interaction、Recommendation system、Content moderation AI、Advanced search
  - ポイント見込み: 16+ points
- Art Gallery: ギャラリーでの作品共有、コメント、いいね、アーティストプロファイル。
  - 推奨モジュール: File upload、User interaction、Image recognition、Advanced search、Custom design system
  - ポイント見込み: 14+ points
- Blogging Platform: ブログの作成と公開、コメント、タグ、カテゴリ、読者エンゲージメント。
  - 推奨モジュール: User interaction、SSR、Advanced search、Sentiment analysis、Multiple languages
  - ポイント見込み: 14+ points
- Recipe Sharing Platform: レシピ共有、評価、コメント、食事計画、買い物リスト。
  - 推奨モジュール: User interaction、File upload、Advanced search、Recommendation system、PWA
  - ポイント見込み: 14+ points

## V.5 Productivity and Tools Projects （生産性およびツール系プロジェクト）

These projects help users organize and manage their work:

これらのプロジェクトは、ユーザーが作業を整理・管理するのを助ける。

- Task Management System: Projects, tasks, assignments, deadlines, team collaboration, and progress tracking.
  - Suggested modules: Organization system, User interaction, Real-time collaborative features, Notification system, Analytics dashboard
  - Point potential: 15+ points
- Code Collaboration Platform: Share code snippets, collaborative coding, version control, and discussions.
  - Suggested modules: User interaction, Real-time collaborative features, Public API, Advanced search, Custom design system
  - Point potential: 14+ points
- Booking System: Reserve resources (rooms, equipment, appointments), calendar, and notifications.
  - Suggested modules: User interaction, Organization system, Notification system, Public API, Advanced search
  - Point potential: 14+ points
- Marketplace Platform: Buy and sell items, with user ratings, messaging, payment integration, and search functionality.
  - Suggested modules: User interaction, File upload, Advanced search, Recommendation system, Public API
  - Point potential: 14+ points
- Fitness Tracker: Log workouts, track progress, challenges, leaderboards, and social features.
  - Suggested modules: User interaction, Gamification, Analytics dashboard, PWA, Data export/import
  - Point potential: 14+ points

- Task Management System: プロジェクト、タスク、割り当て、期限、チームコラボレーション、進捗追跡。
  - 推奨モジュール: Organization system、User interaction、Real-time collaborative features、Notification system、Analytics dashboard
  - ポイント見込み: 15+ points
- Code Collaboration Platform: コードスニペット共有、共同コーディング、バージョン管理、議論。
  - 推奨モジュール: User interaction、Real-time collaborative features、Public API、Advanced search、Custom design system
  - ポイント見込み: 14+ points
- Booking System: 部屋、機材、予約枠などの予約、カレンダー、通知。
  - 推奨モジュール: User interaction、Organization system、Notification system、Public API、Advanced search
  - ポイント見込み: 14+ points
- Marketplace Platform: 商品の売買、ユーザー評価、メッセージング、決済連携、検索機能。
  - 推奨モジュール: User interaction、File upload、Advanced search、Recommendation system、Public API
  - ポイント見込み: 14+ points
- Fitness Tracker: ワークアウト記録、進捗追跡、チャレンジ、リーダーボード、ソーシャル機能。
  - 推奨モジュール: User interaction、Gamification、Analytics dashboard、PWA、Data export/import
  - ポイント見込み: 14+ points

## V.6 Specialized Projects （特化型プロジェクト）

These projects target specific niches or industries:

これらのプロジェクトは特定のニッチや業界を対象とする。

- Real-time Trading Simulator: Stock and cryptocurrency trading simulation with real-time data and portfolios.
  - Suggested modules: Real-time features, User interaction, Analytics dashboard, Public API, Advanced 3D graphics
  - Point potential: 15+ points
- Language Learning Platform: Lessons, exercises, progress tracking, and peer practice.
  - Suggested modules: User interaction, Gamification, Multiple languages, Voice integration, Analytics dashboard
  - Point potential: 15+ points
- Pet Adoption Platform: Browse pets, adoption process, user profiles, and messaging.
  - Suggested modules: User interaction, File upload, Advanced search, Organization system, Notification system
  - Point potential: 14+ points
- Travel Planning Platform: Plan trips, share itineraries, recommendations, and social features.
  - Suggested modules: User interaction, Real-time collaborative features, Recommendation system, Multiple languages, Advanced search
  - Point potential: 15+ points
- Crowdfunding Platform: Create campaigns, donations, updates, and community engagement.
  - Suggested modules: User interaction, File upload, Public API, Analytics dashboard, Notification system
  - Point potential: 14+ points

- Real-time Trading Simulator: リアルタイムデータとポートフォリオを備えた株式・暗号資産の取引シミュレーター。
  - 推奨モジュール: Real-time features、User interaction、Analytics dashboard、Public API、Advanced 3D graphics
  - ポイント見込み: 15+ points
- Language Learning Platform: レッスン、演習、進捗追跡、ピア練習。
  - 推奨モジュール: User interaction、Gamification、Multiple languages、Voice integration、Analytics dashboard
  - ポイント見込み: 15+ points
- Pet Adoption Platform: ペット閲覧、里親手続き、ユーザープロファイル、メッセージング。
  - 推奨モジュール: User interaction、File upload、Advanced search、Organization system、Notification system
  - ポイント見込み: 14+ points
- Travel Planning Platform: 旅行計画、旅程共有、推奨、ソーシャル機能。
  - 推奨モジュール: User interaction、Real-time collaborative features、Recommendation system、Multiple languages、Advanced search
  - ポイント見込み: 15+ points
- Crowdfunding Platform: キャンペーン作成、寄付、更新、コミュニティエンゲージメント。
  - 推奨モジュール: User interaction、File upload、Public API、Analytics dashboard、Notification system
  - ポイント見込み: 14+ points

These are just ideas to inspire you. The key is to choose a project that:

これらは着想のためのアイデアにすぎない。重要なのは、以下の条件を満たすプロジェクトを選択することである。

- Interests your team and motivates everyone to work on it.
- Allows you to implement the required modules (14 points minimum).
- Demonstrates technical complexity and creativity.
- Can be realistically completed within the project timeline.
- Has coherent module combinations that work well together.

- チームの関心を引き、全員のモチベーションを高めるもの。
- 必要なモジュール（最低14ポイント）を実装できるもの。
- 技術的な複雑さと創造性を示すもの。
- プロジェクトのタイムライン内で現実的に完了できるもの。
- うまく連携する首尾一貫したモジュールの組み合わせを持つもの。

Discuss with your team, review the available modules, and choose wisely!

チームで話し合い、利用可能なモジュールを見直し、賢く選択すること。

---

# Chapter VI （第VI章）

# Readme Requirements （Readme要件）

A README.md file must be provided at the root of your Git repository. Its purpose is to allow anyone unfamiliar with the project (peers, staff, recruiters, etc.) to quickly understand what the project is about, how to run it, and where to find more information on the topic.

Gitリポジトリのルートに README.md ファイルを提供しなければならない。目的は、プロジェクトに馴染みのない人（ピア、スタッフ、採用担当者など）が、プロジェクトの内容、実行方法、関連情報の参照先を素早く理解できるようにすることである。

The README.md must include at least:

README.md には少なくとも以下を含めなければならない。

- The very first line must be italicized and read: This project has been created as part of the 42 curriculum by <login1>[, <login2>[, <login3>[...]]].
- A “Description” section that clearly presents the project, including its goal and a brief overview.
- An “Instructions” section containing any relevant information about compilation, installation, and/or execution.
- A “Resources” section listing classic references related to the topic (documentation, articles, tutorials, etc.), as well as a description of how AI was used — specifying for which tasks and which parts of the project.

- 最初の行は斜体で、次のように記載すること: This project has been created as part of the 42 curriculum by <login1>[, <login2>[, <login3>[...]]].
- プロジェクトの目標と簡単な概要を含む、「Description」セクション。
- コンパイル、インストール、および/または実行に関する関連情報を含む、「Instructions」セクション。
- トピックに関連する古典的なリファレンス（ドキュメント、記事、チュートリアルなど）の一覧に加え、AIをどのように使用したか（どのタスクで、プロジェクトのどの部分で）の説明を含む、「Resources」セクション。

Additional sections may be required depending on the project (e.g., usage examples, feature list, technical choices, etc.). Any required additions will be explicitly listed below.

プロジェクトによっては追加セクションが必要な場合がある（例: 使用例、機能リスト、技術的選択など）。必要な追加事項は以下に明示する。

- The “Description” section should also contain a clear name for the project and its key features.
- The “Instructions” section should mention all the needed prerequisites (software, tools, versions, configuration like .env setup, etc.), and step-by-step instructions to run the project.

- 「Description」セクションには、プロジェクトの明確な名称と主要な機能も含めるべきである。
- 「Instructions」セクションには、必要なすべての前提条件（ソフトウェア、ツール、バージョン、.env セットアップなどの設定）と、プロジェクトを実行するためのステップバイステップの手順を記載すべきである。

Additional sections required for this activity:

この課題で追加で必要なセクション:

- Team Information:
  For each team member mentioned at the top of the README.md, you must provide:
  - Assigned role(s): PO, PM, Tech Lead, Developers, etc.
  - Brief description of their responsibilities.
- Project Management:
  - How the team organized the work (task distribution, meetings, etc.).
  - Tools used for project management (GitHub Issues, Trello, etc.).
  - Communication channels used (Discord, Slack, etc.).
- Technical Stack:
  - Frontend technologies and frameworks used.
  - Backend technologies and frameworks used.
  - Database system and why it was chosen.
  - Any other significant technologies or libraries.
  - Justification for major technical choices.
- Database Schema:
  - Visual representation or description of the database structure.
  - Tables/collections and their relationships.
  - Key fields and data types.
- Features List:
  - Complete list of implemented features.
  - Which team member(s) worked on each feature.
  - Brief description of each feature’s functionality.
- Modules:
  - List of all chosen modules (Major and Minor).
  - Point calculation (Major = 2pts, Minor = 1pt).
  - Justification for each module choice, especially for custom "Modules of choice".
  - How each module was implemented.
  - Which team member(s) worked on each module.
- Individual Contributions:
  - Detailed breakdown of what each team member contributed.
  - Specific features, modules, or components implemented by each person.
  - Any challenges faced and how they were overcome.

- Team Information（チーム情報）:
  README.md 冒頭で言及されている各チームメンバーについて、以下を提供しなければならない。
  - 割り当てられた役割: PO、PM、Tech Lead、Developersなど。
  - 責任の簡単な説明。
- Project Management（プロジェクト管理）:
  - チームがどのように作業を構成したか（タスク配分、会議など）。
  - プロジェクト管理に使用したツール（GitHub Issues、Trelloなど）。
  - 使用したコミュニケーションチャネル（Discord、Slackなど）。
- Technical Stack（技術スタック）:
  - 使用したフロントエンド技術とフレームワーク。
  - 使用したバックエンド技術とフレームワーク。
  - データベースシステムとその選択理由。
  - その他の重要な技術やライブラリ。
  - 主要な技術的選択の正当化。
- Database Schema（データベーススキーマ）:
  - データベース構造の視覚的表現または説明。
  - テーブル/コレクションとその関係。
  - 主要フィールドとデータ型。
- Features List（機能リスト）:
  - 実装された機能の完全なリスト。
  - 各機能に取り組んだチームメンバー。
  - 各機能の動作の簡単な説明。
- Modules（モジュール）:
  - 選択した全モジュールのリスト（MajorおよびMinor）。
  - ポイント計算（Major = 2pts、Minor = 1pt）。
  - 各モジュール選択の正当化（特にカスタムの「Modules of choice」）。
  - 各モジュールの実装方法。
  - 各モジュールに取り組んだチームメンバー。
- Individual Contributions（個人の貢献）:
  - 各チームメンバーが貢献した内容の詳細な内訳。
  - 各人が実装した具体的な機能、モジュール、またはコンポーネント。
  - 直面した課題と克服方法。

Any other useful or relevant information is welcome (usage documentation, known limitations, license, credits, etc.).

その他、有用または関連する情報も歓迎する（使用法ドキュメント、既知の制限、ライセンス、クレジットなど）。

The README.md is a critical part of your project evaluation. It should be:

README.md はプロジェクト評価の重要な一部である。以下を満たすべきである。

- Clear and well-organized.
- Complete with all required sections.
- Professional and easy to read.
- Honest about contributions and challenges.

- 明確でよく整理されていること。
- 必要なすべてのセクションが揃っていること。
- 専門的で読みやすいこと。
- 貢献と課題について正直であること。

A poor or incomplete README can negatively impact your evaluation. Your README must be written in English.

貧弱または不完全なREADMEは評価に悪影響を及ぼす。READMEは英語で書かなければならない。

---

# Chapter VII （第VII章）

# Bonus part

The bonus part will be considered only if all required modules have been implemented corresponding to the minimum of 14 mandatory points.

ボーナスパートは、必須である最小14ポイントに対応するすべての必要なモジュールが実装されている場合にのみ考慮される。

Each additional module implemented beyond the required 14 points may be considered as a bonus.

必須の14ポイントを超えて実装された追加モジュールは、ボーナスとして考慮されうる。

For each extra module:

各追加モジュールについて:

- It must be fully functional
- It must meet the module requirements description
- It must add real value to the project
- It must include a proper justification in the README

- 完全に機能していること
- モジュール要件の説明を満たしていること
- プロジェクトに真の付加価値を与えていること
- READMEに適切な正当化が含まれていること

Each validated extra module will be taken into account during the review as follows:

検証された各追加モジュールは、レビュー中に以下のように考慮される。

- Major modules: 2 points each
- Minor modules: 1 point each

- Majorモジュール: 各2 points
- Minorモジュール: 各1 point

You can have a maximum of 5 points (e.g., 5 minor modules, or 2 major modules + 1 minor module).

ボーナスは最大5 pointsまでである（例: Minorモジュール5つ、または Majorモジュール2つ + Minorモジュール1つ）。

---

# Chapter VIII （第VIII章）

# Submission and peer-evaluation （提出とピア評価）

Submit your assignment in your Git repository as usual. Only the work inside your repository will be evaluated during the evaluation. Double-check file names.

通常どおり、Gitリポジトリに課題を提出すること。評価中はリポジトリ内の作業のみが評価される。ファイル名を再確認すること。

We highly recommend that you discuss your ideas with your team and peers before starting to work on the project.

プロジェクト作業を開始する前に、チームやピアとアイデアを話し合うことを強く推奨する。

During the evaluation, a brief modification of the project may occasionally be requested. This could involve a minor behaviour change, a few lines of code to write or rewrite, or an easy-to-add feature.

評価中、プロジェクトの簡単な修正が求められることがある。これは、マイナーな動作変更、数行のコード記述/書き換え、または簡単な機能追加などを含みうる。

While this step may not be applicable to every project, you must be prepared for it if it is mentioned in the evaluation guidelines.

このステップがすべてのプロジェクトに適用されるとは限らないが、評価ガイドラインに記載されている場合は備えておく必要がある。

This step is meant to verify your actual understanding of a specific part of the project.

このステップは、プロジェクトの特定部分に対する実際の理解を検証するためのものである。

The modification can be performed in any development environment you choose (e.g., your usual setup), and it should be feasible within a few minutes — unless a specific time frame is defined as part of the evaluation.

修正は、選択した任意の開発環境（例: 通常のセットアップ）で実施でき、評価の一部として特定の時間枠が定義されていない限り、数分で実現可能な範囲であるべきである。

You can, for example, be asked to make a small update to a function or script, modify a display, or adjust a data structure to store new information, etc.

例えば、関数やスクリプトの小さな更新、表示の変更、新しい情報を格納するためのデータ構造の調整などを求められることがある。

The details (scope, target, etc.) will be specified in the evaluation guidelines and may vary from one evaluation to another for the same project.

詳細（範囲、対象など）は評価ガイドラインで指定され、同一プロジェクトでも評価ごとに異なる場合がある。
