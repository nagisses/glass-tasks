import { motion } from 'motion/react';
import { Modal } from './Modal';

interface Props {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmModal({ open, title, message, confirmLabel, onConfirm, onClose }: Props) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <motion.button type="button" className="btn btn-secondary" onClick={onClose} whileTap={{ scale: 0.96 }}>
            キャンセル
          </motion.button>
          <motion.button
            type="button"
            className="btn btn-danger"
            onClick={() => {
              onConfirm();
              onClose();
            }}
            whileTap={{ scale: 0.96 }}
          >
            {confirmLabel}
          </motion.button>
        </>
      }
    >
      {message && <p className="modal-text">{message}</p>}
    </Modal>
  );
}
