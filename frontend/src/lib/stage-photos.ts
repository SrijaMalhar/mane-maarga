/**
 * Real photographs of poor rural homes in India at each building stage, shown on the Construction page and the
 * family's progress page in place of the drawing. They are examples of what a home looks like at that stage,
 * never the family's own house: their own site photos sit with the stages below.
 *
 * Chosen for small, low-cost homes like the ones PMAY-G builds: one small footprint, local laterite or brick,
 * a sheet or tile roof, no people in frame. Why each was picked, and what was turned down: docs/STAGE_PHOTOS.md.
 *
 * Served by Wikimedia Commons at its standard thumbnail widths only (other widths are rate limited).
 * nginx.conf allows upload.wikimedia.org in img-src. If a photo cannot load, the house drawing shows instead.
 */
export type StagePhoto = {
  key: 'plinth' | 'walls' | 'roof' | 'home'
  /** Commons path under /wikipedia/commons/thumb: hash folders and the URL-encoded file name. */
  path: string
  /** Horizontal crop point for the 4:3 frame, so the house stays in view on wide photos. */
  focus: string
  /** House drawing level shown if the photo cannot load (see House.tsx). */
  level: number
  kn: string
  /** "<stage> done" in Kannada: walls are plural, so the verb changes. */
  knDone: string
  en: string
  alt: string
  place: string
  year: number
  author: string
  license: string
  licenseUrl: string
  source: string
}

const BY = ['CC BY 2.0', 'https://creativecommons.org/licenses/by/2.0/'] as const
const BY_SA = ['CC BY-SA 4.0', 'https://creativecommons.org/licenses/by-sa/4.0/'] as const

export const STAGE_PHOTOS: StagePhoto[] = [
  {
    key: 'plinth', kn: 'ತಳಪಾಯ', knDone: 'ತಳಪಾಯ ಮುಗಿದಿದೆ', en: 'Plinth', level: 1, focus: '45%',
    path: '0/05/Konkan_-_Songiri_Village_-_Ratnagiri_District_-_Part_1_20151217_%2823889167652%29.jpg',
    alt: 'A small laterite plinth filled with red earth, chalk lines marking the rooms, cut blocks stacked at one corner for the walls',
    place: 'Songiri village, Ratnagiri district, Maharashtra', year: 2015, author: 'urbzoo', license: BY[0], licenseUrl: BY[1],
    source: 'https://commons.wikimedia.org/wiki/File:Konkan_-_Songiri_Village_-_Ratnagiri_District_-_Part_1_20151217_(23889167652).jpg',
  },
  {
    key: 'walls', kn: 'ಗೋಡೆಗಳು', knDone: 'ಗೋಡೆಗಳು ಮುಗಿದಿವೆ', en: 'Walls', level: 3, focus: '50%',
    path: 'b/be/Construction-work.jpg',
    alt: 'Bare laterite block walls raised to window height, with openings left for the windows and no roof yet',
    place: 'A village in Maharashtra', year: 2013, author: 'Sachinshelar486', license: BY_SA[0], licenseUrl: BY_SA[1],
    source: 'https://commons.wikimedia.org/wiki/File:Construction-work.jpg',
  },
  {
    key: 'roof', kn: 'ಛಾವಣಿ', knDone: 'ಛಾವಣಿ ಮುಗಿದಿದೆ', en: 'Roof', level: 4, focus: '50%',
    path: 'd/d8/Concrete_Brick_House_Construction_Sasatgre_Oct24_A7CR_03727.jpg',
    alt: 'A small unplastered brick house under a new metal sheet roof, its door and window holes still boarded up',
    place: 'Sasatgre, West Garo Hills, Meghalaya', year: 2024, author: 'Timothy A. Gonsalves', license: BY_SA[0], licenseUrl: BY_SA[1],
    source: 'https://commons.wikimedia.org/wiki/File:Concrete_Brick_House_Construction_Sasatgre_Oct24_A7CR_03727.jpg',
  },
  {
    key: 'home', kn: 'ಮನೆ ಸಿದ್ಧ', knDone: 'ಮನೆ ಸಿದ್ಧ', en: 'Home ready', level: 5, focus: '30%',
    path: 'f/fe/Indian_village_home.jpg',
    alt: 'A finished whitewashed one-storey village home with a clay tile roof and a thatched veranda on wooden poles',
    place: 'A village in India', year: 2017, author: 'Rahul Konga', license: BY_SA[0], licenseUrl: BY_SA[1],
    source: 'https://commons.wikimedia.org/wiki/File:Indian_village_home.jpg',
  },
]

export function stagePhotoUrl(p: StagePhoto, width: 330 | 500 | 960): string {
  const name = p.path.slice(p.path.lastIndexOf('/') + 1)
  return `https://upload.wikimedia.org/wikipedia/commons/thumb/${p.path}/${width}px-${name}`
}

/** Which photo matches the work verified so far. Before any stage is done, the plinth shows as what comes first. */
export function stagePhotoIndex(done: number, total: number): number {
  if (!total || done <= 0) return 0
  return Math.min(3, Math.max(0, Math.ceil((done / total) * 4) - 1))
}
