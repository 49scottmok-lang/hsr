import { t } from '../i18n';

interface OrderButtonsProps {
  index: number;
  length: number;
  onMove: (toIndex: number) => void;
  onRemove: () => void;
}

export function OrderButtons({ index, length, onMove, onRemove }: OrderButtonsProps) {
  return (
    <>
      <button type="button" disabled={index === 0} onClick={() => onMove(index - 1)}>{t('rotation.moveUp')}</button>
      <button type="button" disabled={index === length - 1} onClick={() => onMove(index + 1)}>{t('rotation.moveDown')}</button>
      <button type="button" onClick={onRemove}>{t('rotation.remove')}</button>
    </>
  );
}
