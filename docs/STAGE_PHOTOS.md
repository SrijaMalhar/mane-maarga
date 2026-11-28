# Stage photos

The Construction page and the family's progress page show how far a house has come with a real photograph of a poor rural home at that stage, in place of the drawing they used before. Four photos, one per stage, in the order PMAY-G inspects a house: **plinth, walls, roof, home ready**. The large photo is the stage this house has reached; the strip of four below it shows the whole way, finished stages in colour with a tick, stages still to come in grey. Tapping a stage shows its photo.

They are examples, never the family's own house. Both pages say so beside the photo, in Kannada and English on the family's page. The family's own site photos stay where they were, with each stage further down.

Code: `frontend/src/lib/stage-photos.ts` (the list, credits and the stage each photo stands for) and `frontend/src/components/HouseStages.tsx`.

## Which photo shows when

A stage counts once a reviewer has accepted a site photo and marked it verified, the same rule as the percentage. With the standard four-stage plan:

| Verified stages | Built | Large photo | Label |
| --- | --- | --- | --- |
| 0 of 4 | 0% | Plinth | First comes the plinth |
| 1 of 4 | 25% | Plinth | Plinth done |
| 2 of 4 | 50% | Walls | Walls done |
| 3 of 4 | 75% | Roof | Roof done |
| 4 of 4 | 100% | Home ready | Home ready |

A plan with a different number of stages maps by share: the photo is the quarter of the way the house has reached (`stagePhotoIndex`).

## What each photo had to meet

1. **A poor family's house.** One storey, one small footprint near the 25 sq m PMAY-G minimum (rule AM-05), local walling (laterite or burnt brick), a metal sheet or clay tile roof, no finish beyond whitewash. No large plan, no RCC upper floor, no better-off house in the frame to set the scale.
2. **The stage reads at a glance.** Someone who has never seen a building site can tell plinth from walls from roof.
3. **No people in the frame.** Nobody's face goes on a public page without their say.
4. **A real village, not a scheme event.** No ribbon cutting, handover or poster.
5. **A free licence that allows reuse with credit,** checked against each file's record on Wikimedia Commons on 28 Nov 2026.

## The four

| Stage | Photo | Where, when | By | Licence | Why it fits |
| --- | --- | --- | --- | --- | --- |
| Plinth | [Konkan, Songiri Village, Part 1](https://commons.wikimedia.org/wiki/File:Konkan_-_Songiri_Village_-_Ratnagiri_District_-_Part_1_20151217_(23889167652).jpg) | Songiri, Ratnagiri district, Maharashtra, Dec 2015 | urbzoo | CC BY 2.0 | A small laterite plinth filled with red earth, room lines marked in chalk, cut blocks stacked at the corner ready for the walls. The footprint is a one or two room house. |
| Walls | [Construction-work](https://commons.wikimedia.org/wiki/File:Construction-work.jpg) | A village in Maharashtra, Mar 2013 | Sachinshelar486 | CC BY-SA 4.0 | Bare laterite block walls at window height with the openings left, no roof, loose blocks on the ground. The uploader describes it as the making of a new house. |
| Roof | [Concrete Brick House Construction, Sasatgre](https://commons.wikimedia.org/wiki/File:Concrete_Brick_House_Construction_Sasatgre_Oct24_A7CR_03727.jpg) | Sasatgre, West Garo Hills, Meghalaya, Oct 2024 | Timothy A. Gonsalves | CC BY-SA 4.0 | A one-room unplastered brick house under a new galvanised sheet roof, door and window holes still boarded with sheet. The house is closed in but not finished. |
| Home ready | [Indian village home](https://commons.wikimedia.org/wiki/File:Indian_village_home.jpg) | A village in India, May 2017 | Rahul Konga | CC BY-SA 4.0 | A whitewashed one-storey home with a clay tile roof and a thatched veranda on wooden poles. The uploader wrote that it is their own home in their village. |

Honest limits: none of these is known to be a PMAY-G house, and none is from Karnataka. They are homes of the same size and materials. The laterite in the first two is the same Konkan laterite used along coastal Karnataka. Photos from Karnataka's own stage inspections, shared with permission, would be a better set.

## Turned down

- **Wikimedia's PMAY categories:** only ceremonies, handovers and posters.
- **A plinth in Chemuru, Andhra Pradesh:** a large multi-room footprint, with a better-off house beside it. (An early note also counted the motorbike in frame against it; that was wrong. PMAY-G stopped excluding two-wheeler owners in 2024.)
- **A pink building in Songiri, shot the same day:** the photographer's frame from 15 minutes earlier, in the same colours, is a shrine interior, so this is likely a shrine, not a home.
- **A stone shell in the Thar desert:** reads as abandoned, not in progress.
- **An old house in Belagavi district:** weathered rather than newly built.
- **A house in Salem district:** low resolution, with a person in frame.
- **Portraits and photos with people:** criterion 3.
- **Unsplash:** almost all urban. One small whitewashed tiled house was a fair "home ready", but the Commons photo comes with the owner's own account of it.
- **Openverse:** its search put up a bot check, so it was not used.

## How they are served

From Wikimedia Commons (`upload.wikimedia.org`), which allows hotlinking. Only Wikimedia's standard thumbnail widths are requested (330 for the strip, 500 and 960 for the large photo), because other widths are rate limited since 2026. Requests send no referrer. `frontend/nginx.conf` allows the host in `img-src`.

If a photo cannot load (no network, the host blocked, the file moved), the house drawing for the same stage shows in its place, so the page never shows a broken image.

Commons recommends keeping your own copies, since a hotlinked file can be renamed or deleted. To self-host: put the 960 and 330 pixel versions under `frontend/public/houses/`, have `stagePhotoUrl` return those paths, and keep every credit. Three of the four are CC BY-SA 4.0, so a resized or cropped copy stays under CC BY-SA 4.0 with a note that it was changed.

## Credits on the page

Every photo shows its photographer and licence on the photo, linking to its Commons page, and the "Photo credits" list under the strip gives place, year, author, licence and that each is shown cropped to 4:3.
