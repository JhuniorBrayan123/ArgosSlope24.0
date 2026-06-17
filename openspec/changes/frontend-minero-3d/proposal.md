# Proposal: Frontend Minero 3D

## Intent

The frontend is camera-centric with repetitive views, no analytics, no CRUD, no reporting, and no connection to the .NET backend. Operators need a 3D-first analysis tool: slope viewer as the main page, time-series analytics, fissure lifecycle management, reporting, and geotechnical calculations — all powered by the .NET API.

## Scope

### In Scope
1. **3D slope viewer** as the main home page with timeline slider, heat overlays, measurement tools
2. **Analytics page** with charts by 7d/30d/90d/1y/custom periods, multi-fissure comparison, velocity trends, TTT projection, chart export
3. **Fissure CRUD** — create/edit/archive/close lifecycle, photo attachments, timeline
4. **PDF/CSV report generation** — weekly/monthly/custom reports
5. **Geotechnical calculations page** — RQD, deformation analysis, factor of safety
6. **2D slope plan view** synchronized with the 3D viewer
7. **Enhanced alert center** — actions, escalation threads, comments
8. **Connect to .NET API** (port 5000) replacing FastAPI for all data operations

### Out of Scope
- ML model training or dataset curation
- Real-time video processing (stays in edge Python pipeline)
- Mobile native app
- Multi-language support beyond Spanish

## Capabilities

### New Capabilities
- `slope-3d-viewer`: Interactive 3D slope as main page, timeline slider, heat overlays, measurement tools
- `analytics-trends`: Time-series charts by configurable period, multi-fissure comparison, velocity/TTT trends
- `fissure-lifecycle`: Full create/edit/archive/close CRUD, photo attachments, audit timeline
- `reporting-engine`: PDF weekly/monthly/custom reports, CSV data export
- `geotechnical-calculations`: RQD calculator, deformation analysis, factor of safety
- `slope-map-2d`: 2D plan view synchronized bidirectionally with 3D viewer
- `alert-center-enhanced`: Actions, escalation chains, threaded comments on alerts
- `dotnet-backend-integration`: API client, auth, data sync between frontend and .NET API

### Modified Capabilities
None — all capabilities are new.

## Approach

1. Refactor layout: new `/` page hosts 3D viewer; current `/visualizacion` merged into it
2. Migrate state from React Context to zustand stores (auth, fissure, alert, analytics)
3. Build API client module targeting .NET port 5000 (`.env` configurable)
4. Implement pages incrementally: 3D viewer → Analytics → Fissure CRUD → Geotechnical → Slope Map → Reports → Enhanced Alerts
5. Use Three.js + @react-three/fiber for 3D, recharts for analytics, native browser print/Blob for reports
6. Keep MQTT via browser for real-time updates, but route data through zustand middleware

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `frontend/app/page.js` | Modified | Replace PanelPrincipal with 3D viewer entry |
| `frontend/app/analytics/` | New | Analytics page & sub-routes |
| `frontend/app/fisuras/` | New | Fissure CRUD pages |
| `frontend/app/reportes/` | New | Report generation page |
| `frontend/app/geotecnia/` | New | Geotechnical calculations page |
| `frontend/app/mapa-talud/` | New | 2D slope map page |
| `frontend/components/*.tsx` | Modified | Refactor existing components |
| `frontend/stores/` | New | zustand stores (fissure, alert, analytics, auth) |
| `frontend/lib/api-*.ts` | New | .NET API client modules |
| `frontend/context/MonitorContext.js` | Modified → Deprecated | Migrated to zustand |
| `frontend/app/layout.js` | Modified | Add new nav routes |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| 3D performance on low-end hardware | Med | LOD controls, quality presets |
| .NET API contract mismatches with frontend expectations | High | Validate endpoints early, define OpenAPI types |
| State migration from Context to zustand causes regressions | Med | Keep both live during migration; feature-flag new stores |
| Report generation in browser (no server) | Low | Use client-side PDF lib (jsPDF, html2canvas) |

## Rollback Plan

Revert page.tsx layouts. Restore PanelPrincipal as home page. Revert MonitorContext to active state. Switch API base URL back to FastAPI 8000. Delete new routes. Keep zustand stores if non-breaking.

## Dependencies

- .NET backend running on port 5000 with complete CRUD + geotechnical endpoints
- Existing Three.js + recharts + zustand packages already installed

## Success Criteria

- [ ] 3D slope viewer renders as main page with fissure markers and timeline
- [ ] Analytics page renders period-selectable charts with correct data
- [ ] User can create, edit, archive, and close a fissure end-to-end
- [ ] PDF report downloads with selected data and charts
- [ ] Geotechnical page displays RQD and factor of safety from .NET API
- [ ] 2D plan view highlights update when user interacts with 3D scene
- [ ] Alert detail shows action buttons, escalation options, and comment thread
