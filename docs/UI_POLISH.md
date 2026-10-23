# UI polish review

Status: local preview prepared; user approval is pending. This review does not authorize a push or deployment.

The review uses the `better-ui` skill and clear technical English (`ste`). It covers the complete `web/style.css` file and the icon, dialog, and invite-copy markup in `web/app.js`. The black, yellow, and purple palette, flat borders, and compact spacing remain deliberate design choices.

## Hover behavior

| Severity | Location | Before | After | Why |
| --- | --- | --- | --- | --- |
| HIGH — resolved in source | `web/style.css:1`, `web/style.css:7`, `web/style.css:9`, `web/style.css:32`, `web/style.css:44`, `web/style.css:55`, `web/style.css:144` | Hover rules also applied to touch pointers. | Hover-only rules require `(hover: hover)`; keyboard focus rules remain independent. Disabled action buttons exclude hover feedback. | Hover effects belong to hover-capable pointers. This avoids a touch tap leaving a control looking selected. |

## Surfaces and scrolling

| Severity | Location | Before | After | Why |
| --- | --- | --- | --- | --- |
| MEDIUM — resolved in source | `web/style.css:101` | Equivalent controls and profile surfaces accumulated different corner values. | Shared radius tokens unify controls, surfaces, media, and avatars. The circular send button and rounded message input are explicit exceptions. | Consistent surface treatment preserves the existing visual language. No unnecessary shadows were added. |
| MEDIUM — resolved in source | `web/style.css:132` | Content images had no neutral inset edge treatment. | Content images use a one-pixel pure white/10 outline inset by one pixel. Club artwork and logos are excluded. | A neutral image outline defines the edge without introducing a colored fringe. |
| MEDIUM — resolved in source | `web/style.css:138` | Dialogs and some nested result or import lists could pass end-of-scroll movement to their parent. | Dialogs, artist results, import previews, chat panes, and filter strips contain overscroll. | Containing overlay scroll keeps the page behind it still. |

## Mobile conversation avatars

| Severity | Location | Before | After | Why |
| --- | --- | --- | --- | --- |
| MEDIUM - resolved and checked in the local browser | `web/style.css:184` | The general `.thread>span` flex rule expanded fallback avatar spans on the 390px chat list. | `.thread>.avatar {flex:0 0 auto}` keeps all five fallback avatars square at 44px while conversation text fills the remaining space. | An avatar must retain its own geometry. The parent task found this issue in the local preview, then visually checked the fix. |

## Motion and feedback

| Severity | Location | Before | After | Why |
| --- | --- | --- | --- | --- |
| MEDIUM — resolved in source | `web/style.css:1`, `web/style.css:10`, `web/style.css:149` | The toast used a transition without named properties and moved vertically. Card/image hover motion was unnecessary for frequent interactions. | The toast uses opacity only, 150ms ease-out. Card hover is static. Enabled action buttons scale to 0.96 over 150ms ease-out only with no reduced-motion preference; `data-static` opts out. | Name the properties that change and keep frequent interactions immediate. Reduced motion keeps static and opacity feedback. The former global transition suppression already stopped animated travel; it was not classified as a remaining high-severity motion failure. |
| MEDIUM — resolved in source | `web/style.css:163`, `web/app.js:143`, `web/app.js:145` | Invite-copy feedback had no consistent contextual icon transition. | Copy/check icons share a stack. After a successful copy, they cross-fade over 300ms with `cubic-bezier(0.2,0,0,1)`. Scale 0.25→1 and blur 4px→0 run only without reduced motion. The label also changes to “Copied.” Initial rendering does not animate the state swap. | Contextual feedback stays reversible and understandable without motion. |

## Icon weight

| Severity | Location | Before | After | Why |
| --- | --- | --- | --- | --- |
| MEDIUM — resolved in source | `web/app.js:1`, `web/style.css:159` | One stroke width scaled down with every SVG, including icons beside bold labels. | A single currentColor SVG factory uses non-scaling strokes. CSS selects 1.5px, 2px, or 2.5px strokes for the corresponding contexts. | Icon strokes track adjacent text weight and remain stable at smaller render sizes. |

## Verification and limits

Confirmed by source inspection: hover guards; independent focus feedback; disabled/selected styles; named transition properties; reduced-motion branches; exact press and copy-transition values; first-render suppression; neutral image outlines; scroll containment; icon color and stroke geometry. Source inspection also confirmed that later mobile inbox rules retain the full conversation list and separate open-chat state. Legacy selectors remain; this review did not remove them or change application behavior.

The parent task reported these completed checks in the local preview:

- Desktop People screenshot and populated Create cards after switching tabs.
- Maya's profile dialog opened and closed, with the Close control focused.
- Inbox with five seeded conversations and a persistent composer.
- Profile administration created a local invite. The accessibility tree showed Copy link change to Copied, then return to Copy link.
- A same-origin 390px iframe showed all five mobile conversations. Opening Maya's chat and returning with Back worked. The fallback-avatar fix was then visually checked: all five avatars remained square at 44px.
- All 80 automated tests and the build passed.

These browser results were supplied by the parent task; this reviewer did not repeat them. Seeded conversations and the generated invite were local test data. Production was not changed. User approval is still pending, and this review does not authorize a push or deployment.

Forced-colors rendering, the operating-system reduced-motion setting, physical touch behavior, optical alignment by eye, and animation replay at 10% speed are **Not verified**. This review makes no claim about contrast measurement, performance, or uninspected accessibility behavior.

No HIGH finding remains in the inspected source. The verdict below applies only to that source review; user approval and browser verification are separate.

Approve
