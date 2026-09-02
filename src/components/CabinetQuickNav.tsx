'use client';

import Link from 'next/link';
import { Award, BookOpen, Briefcase, ClipboardList, Medal, ScanLine, Shield, ShoppingBag, Ticket } from 'lucide-react';

type Props = {
  ecoPoints?: number;
  showAchievements?: boolean;
  showShop?: boolean;
  showPortfolio?: boolean;
  guidesDone?: boolean;
  role?: string | null;
};

export default function CabinetQuickNav({
  ecoPoints = 0,
  showAchievements = true,
  showShop = true,
  showPortfolio = true,
  guidesDone = false,
  role,
}: Props) {
  const isMod = role === 'MODERATOR';
  const isAdmin = role === 'ADMIN';
  const isScanner = role === 'SCANNER';
  const isUser = !isMod && !isAdmin && !isScanner && role !== 'TECH';

  return (
    <nav className="cabinet-quick" aria-label="Разделы кабинета">
      {isUser ? (
        <>
          <Link href="/dashboard/applications" className="cabinet-quick__card">
            <span className="cabinet-quick__icon" aria-hidden>
              <ClipboardList size={18} />
            </span>
            <strong>Мои заявки</strong>
            <span>Статусы: подана / одобрена / участник</span>
          </Link>
          <Link href="/tickets" className="cabinet-quick__card">
            <span className="cabinet-quick__icon" aria-hidden>
              <Ticket size={18} />
            </span>
            <strong>Билеты</strong>
            <span>Билеты и история записей</span>
          </Link>
        </>
      ) : null}
      {isMod ? (
        <Link href="/admin/moderation" className="cabinet-quick__card">
          <span className="cabinet-quick__icon" aria-hidden>
            <Shield size={18} />
          </span>
          <strong>Очередь модерации</strong>
          <span>Заявки и контент на проверке</span>
        </Link>
      ) : null}
      {isAdmin ? (
        <Link href="/admin" className="cabinet-quick__card">
          <span className="cabinet-quick__icon" aria-hidden>
            <Shield size={18} />
          </span>
          <strong>Панель управления</strong>
          <span>Пользователи, настройки, модерация</span>
        </Link>
      ) : null}
      {isScanner ? (
        <Link href="/scanner" className="cabinet-quick__card">
          <span className="cabinet-quick__icon" aria-hidden>
            <ScanLine size={18} />
          </span>
          <strong>Сканер</strong>
          <span>Отметить вход по QR</span>
        </Link>
      ) : null}
      <Link href="/dashboard/guides" className="cabinet-quick__card">
        <span className="cabinet-quick__icon" aria-hidden>
          <BookOpen size={18} />
        </span>
        <strong>Инструктаж</strong>
        <span>{guidesDone ? 'Пройден' : 'Как пользоваться порталом'}</span>
      </Link>
      {showAchievements ? (
        <Link href="/dashboard/achievements" className="cabinet-quick__card">
          <span className="cabinet-quick__icon" aria-hidden>
            <Award size={18} />
          </span>
          <strong>Достижения</strong>
          <span>Значки и прогресс</span>
        </Link>
      ) : null}
      {showPortfolio ? (
        <Link href="/dashboard/portfolio" className="cabinet-quick__card">
          <span className="cabinet-quick__icon" aria-hidden>
            <Briefcase size={18} />
          </span>
          <strong>Портфолио</strong>
          <span>Опыт и грамоты</span>
        </Link>
      ) : null}
      {showShop ? (
        <Link href="/dashboard/shop" className="cabinet-quick__card cabinet-quick__card--shop">
          <span className="cabinet-quick__icon" aria-hidden>
            <ShoppingBag size={18} />
          </span>
          <strong>Магазин</strong>
          <span>{ecoPoints.toLocaleString('ru-RU')} мб</span>
        </Link>
      ) : null}
      {showAchievements ? (
        <Link href="/dashboard/awards" className="cabinet-quick__card">
          <span className="cabinet-quick__icon" aria-hidden>
            <Medal size={18} />
          </span>
          <strong>Награды</strong>
          <span>Дипломы и грамоты</span>
        </Link>
      ) : null}
    </nav>
  );
}
