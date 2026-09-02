'use client';

import { formatMskDate, formatMskTimeRange } from '@/lib/booking-hours';
import { useState } from 'react';
import { Calendar } from 'lucide-react';
import JoinEventButton from './JoinEventButton';
import Modal from '@/components/ui/Modal';

export default function SpaceEventsModal({
  bookings,
  sessionUserId,
  spaceTitle,
}: {
  bookings: any[];
  sessionUserId?: string;
  spaceTitle: string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  if (!bookings || bookings.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsOpen(true);
        }}
        className="space-events-trigger"
      >
        <Calendar size={14} aria-hidden />
        Мероприятий: {bookings.length}
      </button>

      <Modal
        open={isOpen}
        onClose={() => setIsOpen(false)}
        title="Афиша мероприятий"
        size="form"
        className="yp-modal--space-events"
      >
        <p className="yp-modal__lead">{spaceTitle}</p>
        <div className="yp-modal__stack">
          {bookings.map((event) => {
            const participantsCount =
              typeof event.participantsCount === 'number'
                ? event.participantsCount
                : event._count?.participants ?? event.participants?.length ?? 0;
            const isFull = participantsCount >= (event.space?.capacity || 0);
            const availableSeats = (event.space?.capacity || 0) - participantsCount;
            const isJoined =
              typeof event.joinedByMe === 'boolean'
                ? event.joinedByMe
                : Boolean(sessionUserId && event.participants?.some((p: any) => p.userId === sessionUserId));

            return (
              <div key={event.id} className="yp-modal__card">
                <div className="yp-modal__card-head">
                  <strong>{event.title || 'Мероприятие'}</strong>
                  <span>
                    {formatMskDate(event.startTime)} · {formatMskTimeRange(event.startTime, event.endTime)}
                  </span>
                </div>
                <p className="yp-modal__muted">
                  Мест: {availableSeats > 0 ? availableSeats : 0}
                  {isJoined ? ' · вы записаны' : ''}
                </p>
                <JoinEventButton
                  eventId={event.id}
                  initialIsJoined={isJoined}
                  initialIsFull={isFull}
                  initialAvailableSeats={availableSeats}
                  title={event.title}
                  startTime={event.startTime}
                  endTime={event.endTime}
                  location={[event.space?.title, event.space?.address].filter(Boolean).join(', ')}
                  description={event.description}
                  compact
                />
              </div>
            );
          })}
        </div>
      </Modal>
    </>
  );
}
