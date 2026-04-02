import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

const CATEGORIES = ['Semua','Pakaian','Perlengkapan','Makanan & Minuman','Elektronik','Kesehatan','Dokumen','Lainnya']
const EVENT_CATEGORIES = ['Trekking','Camping','Traveling','Olahraga','Kerja','Acara','Lainnya']
const ITEM_COLORS = { 'Pakaian':'#378ADD','Perlengkapan':'#1D9E75','Makanan & Minuman':'#BA7517','Elektronik':'#7F77DD','Kesehatan':'#D4537E','Dokumen':'#D85A30','Lainnya':'#888' }

export default function Checklist() {
  const [view, setView] = useState('events') // 'events' | 'templates'
  const [templates, setTemplates] = useState([])
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)

  // Active event/template being viewed
  const [activeEvent, setActiveEvent] = useState(null)
  const [eventItems, setEventItems] = useState([])
  const [activeTemplate, setActiveTemplate] = useState(null)
  const [templateItems, setTemplateItems] = useState([])

  const [showAddEvent, setShowAddEvent] = useState(false)
  const [showAddTemplate, setShowAddTemplate] = useState(false)
  const [showAddItem, setShowAddItem] = useState(false) // 'event' | 'template'
  const [toast, setToast] = useState('')
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState('Semua')

  const [eventForm, setEventForm] = useState({ name:'', date:'', notes:'', template_id:'' })
  const [templateForm, setTemplateForm] = useState({ name:'', category:'Trekking' })
  const [itemForm, setItemForm] = useState({ name:'', category:'Perlengkapan' })
  const [bulkText, setBulkText] = useState('')
  const [showBulk, setShowBulk] = useState(false)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    const [{ data: t }, { data: e }] = await Promise.all([
      supabase.from('checklist_templates').select('*, checklist_template_items(*)').order('created_at', { ascending: false }),
      supabase.from('checklist_events').select('*, checklist_event_items(*)').order('created_at', { ascending: false }),
    ])
    setTemplates(t || [])
    setEvents(e || [])
    setLoading(false)
  }

  async function loadEventItems(eventId) {
    const { data } = await supabase.from('checklist_event_items').select('*').eq('event_id', eventId).order('sort_order')
    setEventItems(data || [])
  }

  async function loadTemplateItems(templateId) {
    const { data } = await supabase.from('checklist_template_items').select('*').eq('template_id', templateId).order('sort_order')
    setTemplateItems(data || [])
  }

  function showToast(msg) { setToast(msg); setTimeout(()=>setToast(''), 2500) }

  // Open event
  async function openEvent(ev) {
    setActiveEvent(ev)
    setActiveTemplate(null)
    await loadEventItems(ev.id)
  }

  // Open template
  async function openTemplate(t) {
    setActiveTemplate(t)
    setActiveEvent(null)
    await loadTemplateItems(t.id)
  }

  // Create event (optionally from template)
  async function createEvent() {
    if (!eventForm.name) return showToast('Isi nama event!')
    setSaving(true)
    const { data: ev } = await supabase.from('checklist_events').insert({
      name: eventForm.name, date: eventForm.date||null,
      notes: eventForm.notes, template_id: eventForm.template_id||null,
    }).select().single()

    // Copy items from template
    if (eventForm.template_id && ev) {
      const { data: tItems } = await supabase.from('checklist_template_items')
        .select('*').eq('template_id', eventForm.template_id).order('sort_order')
      if (tItems?.length) {
        await supabase.from('checklist_event_items').insert(
          tItems.map((ti,i) => ({ event_id: ev.id, name: ti.name, category: ti.category, checked: false, sort_order: i }))
        )
      }
    }
    setSaving(false)
    setShowAddEvent(false)
    setEventForm({ name:'', date:'', notes:'', template_id:'' })
    showToast('Event berhasil dibuat!')
    await loadAll()
    if (ev) openEvent({ ...ev, checklist_event_items: [] })
  }

  // Create template
  async function createTemplate() {
    if (!templateForm.name) return showToast('Isi nama template!')
    setSaving(true)
    const { data: t } = await supabase.from('checklist_templates').insert({
      name: templateForm.name, category: templateForm.category,
    }).select().single()
    setSaving(false)
    setShowAddTemplate(false)
    setTemplateForm({ name:'', category:'Trekking' })
    showToast('Template berhasil dibuat!')
    await loadAll()
    if (t) openTemplate({ ...t, checklist_template_items: [] })
  }

  // Add single item
  async function addItem() {
    if (!itemForm.name.trim()) return showToast('Isi nama item!')
    setSaving(true)
    if (activeEvent) {
      const sort = eventItems.length
      await supabase.from('checklist_event_items').insert({
        event_id: activeEvent.id, name: itemForm.name.trim(),
        category: itemForm.category, checked: false, sort_order: sort,
      })
      await loadEventItems(activeEvent.id)
    } else if (activeTemplate) {
      const sort = templateItems.length
      await supabase.from('checklist_template_items').insert({
        template_id: activeTemplate.id, name: itemForm.name.trim(),
        category: itemForm.category, sort_order: sort,
      })
      await loadTemplateItems(activeTemplate.id)
    }
    setSaving(false)
    setItemForm({ name:'', category:'Perlengkapan' })
    setShowAddItem(false)
    loadAll()
  }

  // Bulk add items (one per line)
  async function addBulkItems() {
    const lines = bulkText.split('\n').map(l=>l.trim()).filter(Boolean)
    if (!lines.length) return showToast('Masukkan setidaknya 1 item!')
    setSaving(true)
    if (activeEvent) {
      const base = eventItems.length
      await supabase.from('checklist_event_items').insert(
        lines.map((name,i) => ({ event_id:activeEvent.id, name, category:itemForm.category, checked:false, sort_order:base+i }))
      )
      await loadEventItems(activeEvent.id)
    } else if (activeTemplate) {
      const base = templateItems.length
      await supabase.from('checklist_template_items').insert(
        lines.map((name,i) => ({ template_id:activeTemplate.id, name, category:itemForm.category, sort_order:base+i }))
      )
      await loadTemplateItems(activeTemplate.id)
    }
    setSaving(false); setBulkText(''); setShowBulk(false)
    showToast(`${lines.length} item berhasil ditambahkan!`); loadAll()
  }

  // Toggle check item
  async function toggleItem(item) {
    await supabase.from('checklist_event_items').update({ checked: !item.checked }).eq('id', item.id)
    setEventItems(prev => prev.map(i => i.id===item.id ? {...i, checked:!i.checked} : i))
  }

  // Delete item
  async function deleteItem(item, isTemplate=false) {
    if (isTemplate) {
      await supabase.from('checklist_template_items').delete().eq('id', item.id)
      setTemplateItems(prev => prev.filter(i=>i.id!==item.id))
    } else {
      await supabase.from('checklist_event_items').delete().eq('id', item.id)
      setEventItems(prev => prev.filter(i=>i.id!==item.id))
    }
    loadAll()
  }

  // Reset all checks
  async function resetChecks() {
    if (!activeEvent) return
    await supabase.from('checklist_event_items').update({ checked: false }).eq('event_id', activeEvent.id)
    await loadEventItems(activeEvent.id)
    showToast('Semua centang direset!')
  }

  // Delete event or template
  async function deleteEvent(id) {
    if (!confirm('Hapus event ini?')) return
    await supabase.from('checklist_event_items').delete().eq('event_id', id)
    await supabase.from('checklist_events').delete().eq('id', id)
    setActiveEvent(null); showToast('Event dihapus!'); loadAll()
  }

  async function deleteTemplate(id) {
    if (!confirm('Hapus template ini? Semua item di template akan terhapus.')) return
    await supabase.from('checklist_template_items').delete().eq('template_id', id)
    await supabase.from('checklist_templates').delete().eq('id', id)
    setActiveTemplate(null); showToast('Template dihapus!'); loadAll()
  }

  // Save current event items as template
  async function saveAsTemplate() {
    const name = prompt('Nama template baru:')
    if (!name) return
    setSaving(true)
    const { data: t } = await supabase.from('checklist_templates').insert({ name, category: 'Lainnya' }).select().single()
    if (t && eventItems.length) {
      await supabase.from('checklist_template_items').insert(
        eventItems.map((item,i) => ({ template_id:t.id, name:item.name, category:item.category, sort_order:i }))
      )
    }
    setSaving(false); showToast('Disimpan sebagai template!'); loadAll()
  }

  if (loading) return <div className="loading">Memuat data...</div>

  // Items to display (filtered)
  const displayItems = activeEvent ? eventItems : templateItems
  const filteredItems = filter==='Semua' ? displayItems : displayItems.filter(i=>i.category===filter)
  const checkedCount = activeEvent ? eventItems.filter(i=>i.checked).length : 0
  const totalCount = activeEvent ? eventItems.length : templateItems.length
  const pct = totalCount>0 ? Math.round(checkedCount/totalCount*100) : 0

  return (
    <div>
      {/* View toggle */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem'}}>
        <div style={{display:'flex',gap:4,background:'#f0f0eb',borderRadius:8,padding:3}}>
          {[{id:'events',label:'Event'},{id:'templates',label:'Template'}].map(v=>(
            <button key={v.id} onClick={()=>{setView(v.id);setActiveEvent(null);setActiveTemplate(null)}}
              style={{padding:'6px 18px',fontSize:13,fontWeight:500,border:'none',cursor:'pointer',borderRadius:6,
                background:view===v.id?'#fff':'transparent',color:view===v.id?'#111':'#888',
                boxShadow:view===v.id?'0 1px 3px rgba(0,0,0,.1)':'none'}}>
              {v.label}
            </button>
          ))}
        </div>
        <button className="btn btn-sm btn-primary"
          onClick={()=>view==='events'?setShowAddEvent(true):setShowAddTemplate(true)}>
          + {view==='events'?'Buat Event':'Buat Template'}
        </button>
      </div>

      {/* ===== EVENTS LIST ===== */}
      {view==='events' && !activeEvent && (
        <div>
          {events.length===0 && (
            <div className="card" style={{textAlign:'center',padding:'3rem',color:'#aaa'}}>
              <div style={{fontSize:40,marginBottom:12}}>📋</div>
              <div style={{fontSize:14,fontWeight:600,marginBottom:6}}>Belum ada event</div>
              <div style={{fontSize:12,marginBottom:16}}>Buat event baru seperti "Trekking Rinjani" dan tambahkan checklist itemnya</div>
              <button className="btn btn-primary" onClick={()=>setShowAddEvent(true)}>+ Buat Event Pertama</button>
            </div>
          )}
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:12}}>
            {events.map(ev => {
              const items = ev.checklist_event_items || []
              const done = items.filter(i=>i.checked).length
              const pct = items.length>0 ? Math.round(done/items.length*100) : 0
              return (
                <div key={ev.id} className="card" style={{cursor:'pointer',transition:'box-shadow .15s'}}
                  onClick={()=>openEvent(ev)}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:10}}>
                    <div>
                      <div style={{fontWeight:700,fontSize:15}}>{ev.name}</div>
                      {ev.date && <div style={{fontSize:11,color:'#aaa',marginTop:2}}>📅 {ev.date}</div>}
                      {ev.notes && <div style={{fontSize:11,color:'#888',marginTop:2}}>{ev.notes}</div>}
                    </div>
                    <button style={{background:'none',border:'none',color:'#ddd',cursor:'pointer',fontSize:18,padding:'0 4px'}}
                      onClick={e=>{e.stopPropagation();deleteEvent(ev.id)}}>×</button>
                  </div>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:12,color:'#888',marginBottom:6}}>
                    <span>{items.length} item</span>
                    <span style={{color:pct===100?'#1D9E75':'#888',fontWeight:pct===100?600:400}}>
                      {pct===100?'✓ Lengkap':done+'/'+items.length+' selesai'}
                    </span>
                  </div>
                  <div style={{height:4,background:'#eee',borderRadius:99,overflow:'hidden'}}>
                    <div style={{width:pct+'%',height:'100%',background:pct===100?'#1D9E75':'#378ADD',borderRadius:99,transition:'width .3s'}}></div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ===== TEMPLATES LIST ===== */}
      {view==='templates' && !activeTemplate && (
        <div>
          {templates.length===0 && (
            <div className="card" style={{textAlign:'center',padding:'3rem',color:'#aaa'}}>
              <div style={{fontSize:40,marginBottom:12}}>📂</div>
              <div style={{fontSize:14,fontWeight:600,marginBottom:6}}>Belum ada template</div>
              <div style={{fontSize:12,marginBottom:16}}>Template membantu kamu tidak perlu membuat checklist dari awal untuk event yang sama</div>
              <button className="btn btn-primary" onClick={()=>setShowAddTemplate(true)}>+ Buat Template Pertama</button>
            </div>
          )}
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))',gap:12}}>
            {templates.map(t => {
              const items = t.checklist_template_items || []
              return (
                <div key={t.id} className="card" style={{cursor:'pointer'}} onClick={()=>openTemplate(t)}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
                    <div>
                      <div style={{fontWeight:700,fontSize:15}}>{t.name}</div>
                      <span style={{fontSize:11,background:'#e6f1fb',color:'#185FA5',padding:'2px 8px',borderRadius:20,display:'inline-block',marginTop:4}}>
                        {t.category}
                      </span>
                    </div>
                    <button style={{background:'none',border:'none',color:'#ddd',cursor:'pointer',fontSize:18,padding:'0 4px'}}
                      onClick={e=>{e.stopPropagation();deleteTemplate(t.id)}}>×</button>
                  </div>
                  <div style={{fontSize:12,color:'#888',marginTop:8}}>{items.length} item</div>
                  <div style={{marginTop:8,display:'flex',flexWrap:'wrap',gap:4}}>
                    {items.slice(0,4).map(i=>(
                      <span key={i.id} style={{fontSize:10,background:'#f5f5f0',color:'#666',padding:'2px 7px',borderRadius:20}}>{i.name}</span>
                    ))}
                    {items.length>4 && <span style={{fontSize:10,color:'#aaa'}}>+{items.length-4} lainnya</span>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ===== ACTIVE EVENT DETAIL ===== */}
      {activeEvent && (
        <div>
          {/* Back + header */}
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:'1rem'}}>
            <button className="btn btn-sm" onClick={()=>setActiveEvent(null)}>← Kembali</button>
            <div style={{flex:1}}>
              <div style={{fontWeight:700,fontSize:16}}>{activeEvent.name}</div>
              {activeEvent.date && <div style={{fontSize:11,color:'#aaa'}}>📅 {activeEvent.date}</div>}
            </div>
            <button className="btn btn-sm" onClick={saveAsTemplate} title="Simpan sebagai template">💾 Simpan Template</button>
            <button className="btn btn-sm" onClick={resetChecks}>↺ Reset</button>
            <button className="btn btn-sm btn-primary" onClick={()=>setShowAddItem(true)}>+ Item</button>
            <button className="btn btn-sm" style={{fontSize:12}} onClick={()=>setShowBulk(true)}>+ Bulk</button>
          </div>

          {/* Progress */}
          <div className="card" style={{padding:'1rem',marginBottom:'1rem'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
              <span style={{fontSize:13,fontWeight:500}}>Progress</span>
              <span style={{fontSize:13,fontWeight:700,color:pct===100?'#1D9E75':'#378ADD'}}>{checkedCount}/{totalCount} item ({pct}%)</span>
            </div>
            <div style={{height:8,background:'#eee',borderRadius:99,overflow:'hidden'}}>
              <div style={{width:pct+'%',height:'100%',background:pct===100?'#1D9E75':'#378ADD',borderRadius:99,transition:'width .3s'}}></div>
            </div>
            {pct===100 && <div style={{fontSize:12,color:'#1D9E75',fontWeight:600,marginTop:6,textAlign:'center'}}>✓ Semua item sudah dicentang!</div>}
          </div>

          {/* Filter by category */}
          <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:'1rem'}}>
            {CATEGORIES.map(c=>(
              <button key={c} onClick={()=>setFilter(c)}
                style={{padding:'4px 12px',fontSize:11,fontWeight:500,border:'1px solid',borderRadius:20,cursor:'pointer',
                  background:filter===c?'#1D9E75':'#fff',color:filter===c?'#fff':'#888',borderColor:filter===c?'#1D9E75':'#e0e0d8'}}>
                {c}
              </button>
            ))}
          </div>

          {/* Items */}
          <div className="card" style={{padding:0,overflow:'hidden'}}>
            {filteredItems.length===0 && (
              <div style={{textAlign:'center',color:'#aaa',padding:'2rem',fontSize:13}}>
                {eventItems.length===0 ? 'Belum ada item. Klik "+ Item" untuk menambah.' : 'Tidak ada item di kategori ini.'}
              </div>
            )}
            {filteredItems.map(item=>(
              <div key={item.id} style={{display:'flex',alignItems:'center',gap:12,padding:'11px 16px',borderBottom:'1px solid #f0f0eb',
                background:item.checked?'#fafaf7':'#fff',transition:'background .15s'}}>
                {/* Checkbox */}
                <div onClick={()=>toggleItem(item)}
                  style={{width:22,height:22,borderRadius:6,border:item.checked?'none':'2px solid #ddd',
                    background:item.checked?'#1D9E75':'#fff',display:'flex',alignItems:'center',justifyContent:'center',
                    cursor:'pointer',flexShrink:0,transition:'all .15s'}}>
                  {item.checked && <span style={{color:'white',fontSize:13,fontWeight:700}}>✓</span>}
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:500,color:item.checked?'#aaa':'#111',
                    textDecoration:item.checked?'line-through':'none',transition:'all .15s'}}>
                    {item.name}
                  </div>
                  {item.category && (
                    <span style={{fontSize:10,color:ITEM_COLORS[item.category]||'#888',fontWeight:500}}>{item.category}</span>
                  )}
                </div>
                <button style={{background:'none',border:'none',color:'#ddd',cursor:'pointer',fontSize:16,padding:'0 4px'}}
                  onClick={()=>deleteItem(item)}>×</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== ACTIVE TEMPLATE DETAIL ===== */}
      {activeTemplate && (
        <div>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:'1rem'}}>
            <button className="btn btn-sm" onClick={()=>setActiveTemplate(null)}>← Kembali</button>
            <div style={{flex:1}}>
              <div style={{fontWeight:700,fontSize:16}}>{activeTemplate.name}</div>
              <span style={{fontSize:11,background:'#e6f1fb',color:'#185FA5',padding:'2px 8px',borderRadius:20}}>{activeTemplate.category}</span>
            </div>
            <button className="btn btn-sm btn-primary" onClick={()=>setShowAddItem(true)}>+ Item</button>
            <button className="btn btn-sm" onClick={()=>setShowBulk(true)}>+ Bulk</button>
          </div>

          <div style={{background:'#e1f5ee',borderRadius:8,padding:'10px 14px',marginBottom:'1rem',fontSize:13,color:'#085041'}}>
            💡 Template ini bisa digunakan saat membuat Event baru — semua item akan otomatis disalin.
          </div>

          {/* Filter */}
          <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:'1rem'}}>
            {CATEGORIES.map(c=>(
              <button key={c} onClick={()=>setFilter(c)}
                style={{padding:'4px 12px',fontSize:11,fontWeight:500,border:'1px solid',borderRadius:20,cursor:'pointer',
                  background:filter===c?'#1D9E75':'#fff',color:filter===c?'#fff':'#888',borderColor:filter===c?'#1D9E75':'#e0e0d8'}}>
                {c}
              </button>
            ))}
          </div>

          <div className="card" style={{padding:0,overflow:'hidden'}}>
            {filteredItems.length===0 && (
              <div style={{textAlign:'center',color:'#aaa',padding:'2rem',fontSize:13}}>
                {templateItems.length===0 ? 'Belum ada item. Klik "+ Item" untuk menambah.' : 'Tidak ada item di kategori ini.'}
              </div>
            )}
            {filteredItems.map(item=>(
              <div key={item.id} style={{display:'flex',alignItems:'center',gap:12,padding:'11px 16px',borderBottom:'1px solid #f0f0eb'}}>
                <div style={{width:22,height:22,borderRadius:6,border:'2px solid #ddd',flexShrink:0}}></div>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:500}}>{item.name}</div>
                  {item.category && <span style={{fontSize:10,color:ITEM_COLORS[item.category]||'#888',fontWeight:500}}>{item.category}</span>}
                </div>
                <button style={{background:'none',border:'none',color:'#ddd',cursor:'pointer',fontSize:16}}
                  onClick={()=>deleteItem(item,true)}>×</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== MODALS ===== */}

      {/* Add Event */}
      {showAddEvent && (
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setShowAddEvent(false)}>
          <div className="modal" style={{width:460}}>
            <div className="modal-title">Buat Event Baru</div>
            <div style={{display:'flex',flexDirection:'column',gap:12}}>
              <div className="form-group"><label>Nama Event</label>
                <input placeholder="cth. Trekking Rinjani, Camping Bromo..." value={eventForm.name} onChange={e=>setEventForm({...eventForm,name:e.target.value})} />
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                <div className="form-group"><label>Tanggal (opsional)</label>
                  <input type="date" value={eventForm.date} onChange={e=>setEventForm({...eventForm,date:e.target.value})} />
                </div>
                <div className="form-group"><label>Gunakan Template</label>
                  <select value={eventForm.template_id} onChange={e=>setEventForm({...eventForm,template_id:e.target.value})}>
                    <option value="">Tanpa template (mulai kosong)</option>
                    {templates.map(t=><option key={t.id} value={t.id}>{t.name} ({(t.checklist_template_items||[]).length} item)</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group"><label>Catatan (opsional)</label>
                <input placeholder="cth. Via Senaru, 3D2N..." value={eventForm.notes} onChange={e=>setEventForm({...eventForm,notes:e.target.value})} />
              </div>
              {eventForm.template_id && (
                <div style={{background:'#e1f5ee',borderRadius:8,padding:'8px 12px',fontSize:12,color:'#085041'}}>
                  ✓ {(templates.find(t=>t.id===eventForm.template_id)?.checklist_template_items||[]).length} item akan disalin dari template
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={()=>setShowAddEvent(false)}>Batal</button>
              <button className="btn btn-primary" onClick={createEvent} disabled={saving}>{saving?'Membuat...':'Buat Event'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Template */}
      {showAddTemplate && (
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setShowAddTemplate(false)}>
          <div className="modal" style={{width:400}}>
            <div className="modal-title">Buat Template Baru</div>
            <div style={{display:'flex',flexDirection:'column',gap:12}}>
              <div className="form-group"><label>Nama Template</label>
                <input placeholder="cth. Trekking Gunung, Camping..." value={templateForm.name} onChange={e=>setTemplateForm({...templateForm,name:e.target.value})} />
              </div>
              <div className="form-group"><label>Kategori</label>
                <select value={templateForm.category} onChange={e=>setTemplateForm({...templateForm,category:e.target.value})}>
                  {EVENT_CATEGORIES.map(c=><option key={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={()=>setShowAddTemplate(false)}>Batal</button>
              <button className="btn btn-primary" onClick={createTemplate} disabled={saving}>{saving?'Membuat...':'Buat Template'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Item */}
      {showAddItem && (activeEvent||activeTemplate) && (
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setShowAddItem(false)}>
          <div className="modal" style={{width:380}}>
            <div className="modal-title">Tambah Item</div>
            <div style={{display:'flex',flexDirection:'column',gap:12}}>
              <div className="form-group"><label>Nama Item</label>
                <input placeholder="cth. Sepatu trail, Jas hujan..." value={itemForm.name}
                  onChange={e=>setItemForm({...itemForm,name:e.target.value})}
                  onKeyDown={e=>e.key==='Enter'&&addItem()} autoFocus />
              </div>
              <div className="form-group"><label>Kategori</label>
                <select value={itemForm.category} onChange={e=>setItemForm({...itemForm,category:e.target.value})}>
                  {CATEGORIES.filter(c=>c!=='Semua').map(c=><option key={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={()=>setShowAddItem(false)}>Batal</button>
              <button className="btn btn-primary" onClick={addItem} disabled={saving}>{saving?'Menyimpan...':'Tambah'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Add */}
      {showBulk && (activeEvent||activeTemplate) && (
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setShowBulk(false)}>
          <div className="modal" style={{width:420}}>
            <div className="modal-title">Tambah Item Sekaligus</div>
            <p style={{fontSize:13,color:'#888',marginBottom:12}}>Tulis satu item per baris, langsung tambah banyak sekaligus.</p>
            <div style={{display:'flex',flexDirection:'column',gap:12}}>
              <div className="form-group"><label>Kategori untuk semua item ini</label>
                <select value={itemForm.category} onChange={e=>setItemForm({...itemForm,category:e.target.value})}>
                  {CATEGORIES.filter(c=>c!=='Semua').map(c=><option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="form-group"><label>Daftar Item (satu per baris)</label>
                <textarea placeholder={"Sepatu trail\nKaos kaki extra\nJas hujan\nHeadlamp\nTrekking pole"} value={bulkText}
                  onChange={e=>setBulkText(e.target.value)} style={{minHeight:160,fontFamily:'monospace',fontSize:13}} />
              </div>
              {bulkText && <div style={{fontSize:12,color:'#1D9E75'}}>{bulkText.split('\n').filter(l=>l.trim()).length} item akan ditambahkan</div>}
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={()=>setShowBulk(false)}>Batal</button>
              <button className="btn btn-primary" onClick={addBulkItems} disabled={saving}>{saving?'Menambahkan...':'Tambah Semua'}</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
