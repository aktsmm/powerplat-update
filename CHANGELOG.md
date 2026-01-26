# Changelog

All notable changes to this project will be documented in this file.

## [0.1.5] - 2026-01-27

### Fixed

- Fixed date filter not working due to date format mismatch (MM/DD/YYYY → YYYY-MM-DD normalization)
- Sync now correctly saves updates to database

### Added

- Support for D365 UPDATE extension's GitHub token as fallback (`d365Update.githubToken`)
- Date normalization function for consistent ISO 8601 format

## [0.1.0] - 2026-01-26

### Added

- Initial release
- MCP Server for Power Platform updates
- Search functionality for Power Apps, Power Automate, Power BI, Power Pages, Copilot Studio, AI Builder
- GitHub synchronization from MicrosoftDocs repositories
- SQLite database with FTS5 full-text search
- Japanese and English locale support for Microsoft Learn URLs

## [0.1.1] - 2026-01-26

### Changed

- Updated extension icon to a Power Platform–distinct color scheme

## [0.1.2] - 2026-01-26

### Changed

- Updated LICENSE and aligned wording with D365 UPDATE
- Rewrote README.md in English and added language links

## [0.1.3] - 2026-01-26

### Changed

- Changed license from CC BY-NC 4.0 to CC BY-NC-SA 4.0
