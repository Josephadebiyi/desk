/** Canvas presets (pixels). Print sizes are at 300 dpi. */
export interface Preset {
  id: string
  label: string
  group: 'Social' | 'Print' | 'Video'
  w: number
  h: number
}
export const PRESETS: Preset[] = [
  { id: 'ig-portrait', label: 'Instagram post 4:5', group: 'Social', w: 1080, h: 1350 },
  { id: 'ig-square', label: 'Instagram post 1:1', group: 'Social', w: 1080, h: 1080 },
  { id: 'story', label: 'Story / Reels / WhatsApp status', group: 'Social', w: 1080, h: 1920 },
  { id: 'fb-post', label: 'Facebook post', group: 'Social', w: 1200, h: 1500 },
  { id: 'fb-link', label: 'Facebook / X link image', group: 'Social', w: 1200, h: 630 },
  { id: 'fb-cover', label: 'Facebook cover', group: 'Social', w: 1640, h: 624 },
  { id: 'fb-event', label: 'Facebook event cover', group: 'Social', w: 1920, h: 1005 },
  { id: 'youtube', label: 'YouTube thumbnail', group: 'Video', w: 1280, h: 720 },
  { id: 'slide', label: 'Presentation slide 16:9', group: 'Video', w: 1920, h: 1080 },
  { id: 'a4', label: 'A4 poster (300 dpi)', group: 'Print', w: 2480, h: 3508 },
  { id: 'a5', label: 'A5 flyer (300 dpi)', group: 'Print', w: 1748, h: 2480 },
  { id: 'letter', label: 'US Letter (300 dpi)', group: 'Print', w: 2550, h: 3300 },
  { id: 'banner', label: 'Roll-up banner 85×200 cm (100 dpi)', group: 'Print', w: 3346, h: 7874 },
]
export const formatFor = (w: number, h: number) => (Math.abs(w - h) < 10 ? 'square' : h > w * 1.6 ? 'story' : w > h ? 'landscape' : 'portrait') as 'square' | 'story' | 'landscape' | 'portrait'
