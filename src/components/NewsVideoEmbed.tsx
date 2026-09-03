import { isAllowedVkVideoEmbed, normalizeVkVideoEmbed } from '@/lib/vk-media';

type Props = {
  src?: string | null;
  title?: string | null;
};

/** Safe VK video_ext.php iframe for news detail. */
export default function NewsVideoEmbed({ src, title }: Props) {
  const embed = src ? normalizeVkVideoEmbed(src) : null;
  if (!embed || !isAllowedVkVideoEmbed(embed)) return null;

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: '16 / 9',
        background: '#0f172a',
        overflow: 'hidden',
      }}
    >
      <iframe
        src={embed}
        title={title || 'Видео ВКонтакте'}
        allow="autoplay; encrypted-media; fullscreen; picture-in-picture; screen-wake-lock"
        allowFullScreen
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          border: 0,
        }}
      />
    </div>
  );
}
