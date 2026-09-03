# Модель данных (Prisma)

Источник: /opt/sochi-portal/prisma/schema.prisma

## Сущности
- User (роли: USER, PARTICIPANT, MODERATOR, ADMIN)
- Project, Club + Application (PENDING/APPROVED/REJECTED)
- Space + Booking + BookingParticipant
- PageContent (управляемые страницы)
- SiteSettings (SMTP, соцсети, VK API, настройки бронирования)
- News (ручные + VK)
- Account, Session, VerificationToken, PendingUser (NextAuth)
