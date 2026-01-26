# Changelog

All notable changes to this project will be documented in this file.

## [0.1.8] - 2026-01-27

### Fixed

- Fixed server version mismatch (was showing 0.1.6 instead of actual version)

## [0.1.7] - 2026-01-27

### Added

- **Parallel processing**: Repository tree fetching, file processing, and commit retrieval now run in parallel (85% faster sync: 150s → 21s)
- **Background sync**: Automatic sync triggers in background when data is stale (>1 hour), returns cached data immediately
- **Incremental sync**: Only fetches changed files since last sync for faster subsequent updates

### Performance

- Full sync: 150s → 21s (86% improvement)
- Incremental sync: 5-15s for subsequent updates
- Search response: Immediate (no blocking on sync)

## [0.1.6] - 2026-01-27

### Added

- Pre-seeded database included in package for instant use without initial sync
- Automatic seed database copy on first launch

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
