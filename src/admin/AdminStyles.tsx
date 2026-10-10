/** Staff console → Flyer styles: ZionDesk's own designs that Ellen uses as style references for AI flyers. */
import { Eye, EyeOff, Trash2, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import { STYLE_TAG_KEYS } from '../lib/designStyles'
import { Card, Head } from './Admin'

interface Style {
  id: string
  title: string
  tags: string[]
  image_url: string
  active: boolean
  uses: number
  created_at: string
}
const err = (e: unknown) => (e instanceof Error ? e.message : String(e))
const label = (t: string) => (t === 'newyear' ? 'New year' : t[0].toUpperCase() + t.slice(1))

/** File → base64 + pixel size. */
async function read(file: File) {
  const data = await new Promise<string>((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(String(r.result).split(',')[1] ?? '')
    r.onerror = rej
    r.readAsDataURL(file)
  })
  const size = await new Promise<{ w: number; h: number }>((res) => {
    const img = new Image()
    img.onload = () => res({ w: img.naturalWidth, h: img.naturalHeight })
    img.onerror = () => res({ w: 0, h: 0 })
    img.src = URL.createObjectURL(file)
  })
  return { data, ...size }
}

export function AdminStyles() {
  const [rows, setRows] = useState<Style[] | null>(null)
  const [msg, setMsg] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [progress, setProgress] = useState('')
  const [filter, setFilter] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const load = () => api<{ styles: Style[] }>('/admin/design-styles').then((r) => setRows(r.styles)).catch((e) => setMsg(err(e)))
  useEffect(() => {
    void load()
  }, [])

  const upload = async (files: File[]) => {
    const ok = files.filter((f) => /^image\/(png|jpeg|webp)$/.test(f.type) && f.size <= 8 * 1024 * 1024)
    if (ok.length < files.length) setMsg(`${files.length - ok.length} file(s) skipped — PNG / JPG / WEBP up to 8 MB only.`)
    for (const [i, f] of ok.entries()) {
      setProgress(`Uploading ${i + 1} of ${ok.length}…`)
      try {
        const { data, w, h } = await read(f)
        const title = f.name.replace(/\.\w+$/, '').replace(/[-_]+/g, ' ').slice(0, 80)
        const r = await api<{ style: Style }>('/admin/design-styles', { data, contentType: f.type, title, tags, width: w, height: h })
        setRows((x) => [r.style, ...(x ?? [])])
      } catch (e) {
        setMsg(`${f.name}: ${err(e)}`)
      }
    }
    setProgress('')
  }
  const patch = async (s: Style, p: Partial<Style>) => {
    setRows((x) => x?.map((y) => (y.id === s.id ? { ...y, ...p } : y)) ?? null)
    await api(`/admin/design-styles/${s.id}`, p, 'PATCH').catch((e) => setMsg(err(e)))
  }
  const remove = async (s: Style) => {
    if (!window.confirm(`Delete “${s.title || 'this style'}”? Ellen will stop using it.`)) return
    await api(`/admin/design-styles/${s.id}`, undefined, 'DELETE').catch((e) => setMsg(err(e)))
    setRows((x) => x?.filter((y) => y.id !== s.id) ?? null)
  }
  const shown = (rows ?? []).filter((s) => !filter || s.tags.includes(filter))

  return (
    <>
      <Head title="Flyer styles" sub="Your own designs. Ellen recreates their look for each church’s event, with the church’s own wording, never this text." />
      {msg && <p className="adm-err">{msg}</p>}
      <Card title="Upload designs" sub="PNG, JPG or WEBP, up to 8 MB each. Pick the tags first; they apply to every file in this upload.">
        <div className="adm-chips">
          {STYLE_TAG_KEYS.map((t) => (
            <button key={t} type="button" className={`adm-chip ${tags.includes(t) ? 'is-on' : ''}`} onClick={() => setTags((x) => (x.includes(t) ? x.filter((y) => y !== t) : [...x, t].slice(0, 6)))}>
              {label(t)}
            </button>
          ))}
        </div>
        <div
          className="adm-drop"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            void upload([...e.dataTransfer.files])
          }}
          onClick={() => input.current?.click()}
        >
          <Upload size={20} />
          <b>{progress || 'Drop designs here, or click to choose'}</b>
          <small>{tags.length ? `Tags: ${tags.map(label).join(', ')}` : 'No tags chosen: they will be saved as “General”.'}</small>
        </div>
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(e) => (void upload([...(e.target.files ?? [])]), (e.target.value = ''))} />
      </Card>
      <Card
        title={`${shown.length} style${shown.length === 1 ? '' : 's'}`}
        action={
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">All tags</option>
            {STYLE_TAG_KEYS.map((t) => (
              <option key={t} value={t}>
                {label(t)}
              </option>
            ))}
          </select>
        }
      >
        {!rows ? (
          <p className="adm-empty">Loading…</p>
        ) : !shown.length ? (
          <p className="adm-empty">No styles yet. Upload your first designs above.</p>
        ) : (
          <div className="adm-styles">
            {shown.map((s) => (
              <figure key={s.id} className={`adm-style ${s.active ? '' : 'is-off'}`}>
                <img src={s.image_url} alt={s.title} loading="lazy" />
                <figcaption>
                  <input defaultValue={s.title} maxLength={80} onBlur={(e) => e.target.value !== s.title && patch(s, { title: e.target.value })} />
                  <div className="adm-chips is-small">
                    {STYLE_TAG_KEYS.map((t) => (
                      <button key={t} type="button" className={`adm-chip ${s.tags.includes(t) ? 'is-on' : ''}`} onClick={() => patch(s, { tags: s.tags.includes(t) ? s.tags.filter((y) => y !== t) : [...s.tags, t].slice(0, 6) })}>
                        {label(t)}
                      </button>
                    ))}
                  </div>
                  <div className="adm-style-actions">
                    <small>Used {s.uses}×</small>
                    <button type="button" className="adm-btn ghost" onClick={() => patch(s, { active: !s.active })} title={s.active ? 'Hide from Ellen' : 'Let Ellen use it'}>
                      {s.active ? <Eye size={15} /> : <EyeOff size={15} />} {s.active ? 'On' : 'Off'}
                    </button>
                    <button type="button" className="adm-btn ghost danger" onClick={() => remove(s)} title="Delete">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </figcaption>
              </figure>
            ))}
          </div>
        )}
      </Card>
    </>
  )
}
