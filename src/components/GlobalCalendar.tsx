'use client';

import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, MapPin } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { formatMskTimeRange, getTzYmd, calendarCellYmd } from '@/lib/booking-hours';
import { encodeRouteParam } from '@/lib/route-id';

interface GlobalEvent {
  id: string;
  title: string;
  description: string;
  startTime: string;
  endTime: string;
  status: string;
  user: { name: string };
  space: { id: string; title: string; address: string; capacity: number };
  participantsCount: number;
  joinedByMe: boolean;
}

export default function GlobalCalendar() {
  const { data: session } = useSession();
  const router = useRouter();
  
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [events, setEvents] = useState<GlobalEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/events')
      .then(res => res.json())
      .then(data => {
        setEvents(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(err => {
        console.error("Ошибка загрузки событий:", err);
        setLoading(false);
      });
  }, []);

  const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();
  const startingDay = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1; 

  const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  const dayNames = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

  const handlePrevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  const handleNextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));

  const handleDateClick = (day: number) => {
    const clickedDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
    setSelectedDate(clickedDate);
  };

  const isDateSelected = (day: number) => {
    if (!selectedDate) return false;
    return selectedDate.getDate() === day && 
           selectedDate.getMonth() === currentDate.getMonth() && 
           selectedDate.getFullYear() === currentDate.getFullYear();
  };

  const handleJoinEvent = async (eventId: string) => {
    if (!session) {
      router.push('/login');
      return;
    }
    
    try {
      const res = await fetch(`/api/bookings/${eventId}/join`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setEvents(prev => prev.map(event => {
          if (event.id === eventId) {
             return {
               ...event,
               joinedByMe: Boolean(data.joined),
               participantsCount: Math.max(0, (event.participantsCount || 0) + (data.joined ? 1 : -1)),
             };
          }
          return event;
        }));
        setMessage({ type: 'success', text: data.message });
      } else {
         const data = await res.json();
         setMessage({ type: 'error', text: data.message || 'Ошибка' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Ошибка при присоединении' });
    }
  };

  return (
    <div style={{ backgroundColor: 'white', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)', border: '1px solid rgba(0,0,0,0.05)', overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))' }}>
        
        {/* Calendar Side */}
        <div style={{ padding: '1.5rem', backgroundColor: '#f8fafc', borderRight: '1px solid rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <button type="button" onClick={handlePrevMonth} style={{ padding: '0.5rem', borderRadius: '50%', background: 'transparent', transition: 'background 0.2s' }} onMouseOver={e => e.currentTarget.style.background = 'rgba(0,0,0,0.05)'} onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
              <ChevronLeft size={24} />
            </button>
            <h4 style={{ fontWeight: 800, fontSize: '1.25rem', color: 'var(--foreground)' }}>
              {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
            </h4>
            <button type="button" onClick={handleNextMonth} style={{ padding: '0.5rem', borderRadius: '50%', background: 'transparent', transition: 'background 0.2s' }} onMouseOver={e => e.currentTarget.style.background = 'rgba(0,0,0,0.05)'} onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
              <ChevronRight size={24} />
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '0.5rem', textAlign: 'center', marginBottom: '1rem' }}>
            {dayNames.map(day => (
              <div key={day} style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--muted)', padding: '0.5rem 0' }}>{day}</div>
            ))}
            
            {Array.from({ length: startingDay }).map((_, i) => (
              <div key={`empty-${i}`} style={{ padding: '0.5rem' }}></div>
            ))}
            
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const isSelected = isDateSelected(day);
              
              const cellYmd = calendarCellYmd(currentDate.getFullYear(), currentDate.getMonth(), day);
              const hasEvents = events.some((b) => getTzYmd(new Date(b.startTime)) === cellYmd);
              
              let btnStyle: React.CSSProperties = {
                width: '36px', height: '36px', margin: '0 auto', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem', transition: 'all 0.2s', border: 'none', fontWeight: isSelected ? 700 : 500
              };

              if (isSelected) {
                btnStyle = { ...btnStyle, backgroundColor: 'var(--primary)', color: 'white', boxShadow: 'var(--shadow-md)', cursor: 'pointer', transform: 'scale(1.05)' };
              } else if (hasEvents) {
                btnStyle = { ...btnStyle, color: 'var(--primary)', backgroundColor: 'rgba(59, 130, 246, 0.1)', cursor: 'pointer' };
              } else {
                btnStyle = { ...btnStyle, color: 'var(--foreground)', backgroundColor: 'transparent', cursor: 'pointer' };
              }
              
              return (
                <button
                  type="button"
                  key={day}
                  onClick={() => handleDateClick(day)}
                  style={btnStyle}
                  onMouseOver={e => { if (!isSelected && !hasEvents) e.currentTarget.style.backgroundColor = '#f1f5f9'; }}
                  onMouseOut={e => { if (!isSelected && !hasEvents) e.currentTarget.style.backgroundColor = 'transparent'; }}
                >
                  <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {day}
                    {hasEvents && !isSelected && (
                      <div style={{ position: 'absolute', bottom: '4px', width: '5px', height: '5px', borderRadius: '50%', backgroundColor: 'var(--primary)' }} />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
          
          <div style={{ marginTop: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--muted)', justifyContent: 'center' }}>
            <div style={{ width: '14px', height: '14px', borderRadius: '50%', backgroundColor: 'rgba(59, 130, 246, 0.1)', border: '2px solid var(--primary)' }}></div> Есть мероприятия
            <div style={{ width: '14px', height: '14px', borderRadius: '50%', backgroundColor: 'var(--primary)', marginLeft: '1rem' }}></div> Выбрано
          </div>
        </div>

        {/* Form Side */}
        <div style={{ padding: '1.5rem' }}>
          {message && (
            <div style={{ padding: '1rem', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem', backgroundColor: message.type === 'success' ? '#f0fdf4' : '#fef2f2', color: message.type === 'success' ? '#15803d' : '#b91c1c' }}>
              {message.text}
            </div>
          )}

          {(() => {
            if (!selectedDate) {
               return (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: '300px', color: 'var(--muted)', textAlign: 'center' }}>
                     <CalendarIcon size={48} color="var(--primary)" style={{ opacity: 0.5, marginBottom: '1rem' }} />
                     <h4 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--foreground)' }}>Афиша мероприятий</h4>
                     <p>Выберите дату в календаре слева, чтобы посмотреть, какие события запланированы на этот день.</p>
                  </div>
               )
            }

            const selectedYmd = calendarCellYmd(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
            const selectedDateEvents = events.filter((b) => getTzYmd(new Date(b.startTime)) === selectedYmd);

            if (selectedDateEvents.length === 0) {
               return (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: '300px', color: 'var(--muted)', textAlign: 'center' }}>
                     <p style={{ fontSize: '1.1rem' }}>На <b>{selectedDate.toLocaleDateString()}</b> мероприятий пока не запланировано.</p>
                     <p style={{ marginTop: '1rem', fontSize: '0.9rem' }}>Хотите организовать своё? Перейдите в раздел <Link href="/spaces" style={{ color: 'var(--primary)', textDecoration: 'underline' }}>Пространства</Link>.</p>
                  </div>
               )
            }

            return (
              <div>
                <h4 style={{ fontWeight: 800, fontSize: '1.5rem', marginBottom: '1.5rem', color: 'var(--foreground)' }}>
                  События {selectedDate.toLocaleDateString()}
                </h4>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  {selectedDateEvents.map(event => {
                    const isJoined = Boolean(event.joinedByMe);
                    const participantsCount = event.participantsCount || 0;
                    const availableSeats = event.space.capacity - participantsCount;
                    const isFull = availableSeats <= 0;

                    return (
                    <div key={event.id} style={{ padding: '1.5rem', border: '1px solid rgba(0,0,0,0.1)', borderRadius: 'var(--radius-lg)', backgroundColor: '#fff', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
                      <h5 style={{ fontWeight: 800, fontSize: '1.2rem', marginBottom: '0.5rem' }}>{event.title}</h5>
                      
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--primary)', fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.75rem' }}>
                         <MapPin size={16} /> 
                         <Link href={`/spaces/${encodeRouteParam(event.space.id)}`} style={{ textDecoration: 'underline' }}>
                           {event.space.title}
                         </Link>
                      </div>

                      {event.description && <p style={{ fontSize: '0.95rem', color: 'var(--muted)', marginBottom: '1rem', lineHeight: 1.6 }}>{event.description}</p>}
                      
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', padding: '1rem', backgroundColor: '#f8fafc', borderRadius: 'var(--radius-md)', marginBottom: '1.25rem' }}>
                        <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--foreground)' }}>
                          🕒 {formatMskTimeRange(event.startTime, event.endTime)} (МСК)
                          <div style={{ marginTop: '0.25rem', color: 'var(--muted)', fontWeight: 400 }}>
                            Организатор: {event.user?.name || 'Пользователь'}
                          </div>
                        </div>
                        
                        <div style={{ fontSize: '0.85rem', fontWeight: 700, padding: '0.5rem 0.75rem', backgroundColor: isFull ? '#fee2e2' : '#dcfce7', color: isFull ? '#991b1b' : '#166534', borderRadius: 'var(--radius-sm)' }}>
                          {isFull ? 'Мест нет' : 'Есть места'}
                        </div>
                      </div>

                      {new Date(event.endTime) > new Date() ? (
                        <button 
                          type="button"
                          onClick={() => handleJoinEvent(event.id)}
                          disabled={!isJoined && isFull}
                          className={`btn ${isJoined ? 'btn-secondary' : 'btn-primary'}`} 
                          style={{ width: '100%', padding: '0.75rem', fontSize: '1rem', opacity: (!isJoined && isFull) ? 0.5 : 1, cursor: (!isJoined && isFull) ? 'not-allowed' : 'pointer' }}
                        >
                          {isJoined ? '✅ Вы идете (Отменить)' : isFull ? 'Мест нет' : 'Пойду!'}
                        </button>
                      ) : (
                         <div style={{ textAlign: 'center', color: 'var(--muted)', fontWeight: 500, fontSize: '0.9rem' }}>Мероприятие завершено</div>
                      )}
                    </div>
                  )})}
                </div>
              </div>
            );
          })()}

        </div>
      </div>
    </div>
  );
}
