import { useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { Link, useLocation } from 'wouter';
import { api } from '../api';
import type { User } from '../api';
import { coverUrl } from '../format';
import { qk, useLists } from '../hooks';
import { usePrefs } from '../prefs';
import { Accordion } from './Accordion';
import { Home, Layers, LogOut, Plus, Sliders } from './Icons';
import { Modal } from './Modal';
import { RadioGroup } from './RadioGroup';
import { MenuListSkeleton } from './Skeleton';
import { useToast } from './Toast';

interface Props {
  open: boolean;
  onClose: () => void;
  user: User;
  onCreateList: () => void;
}

export function SideMenu({ open, onClose, user, onCreateList }: Props) {
  const lists = useLists();
  const prefs = usePrefs();
  const [location, navigate] = useLocation();
  const qc = useQueryClient();
  const toast = useToast();

  const logout = async () => {
    try {
      await api.logout();
    } catch {
      toast({ message: 'ログアウトできませんでした', tone: 'error' });
      return;
    }
    onClose();
    navigate('/');
    qc.setQueryData(qk.me, null);
    qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
  };

  const current = (href: string) => (location === href || location.startsWith(`${href}/`) ? 'page' : undefined);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="メニュー"
      variant="drawer"
      footer={
        <div className="account">
          {user.picture ? (
            <img className="avatar" src={user.picture} alt="" referrerPolicy="no-referrer" />
          ) : (
            <span className="avatar avatar-initial" aria-hidden="true">
              {(user.name || user.email).slice(0, 1).toUpperCase()}
            </span>
          )}
          <span className="account-text">
            <span className="account-name">{user.name || user.email}</span>
            <span className="account-email">{user.email}</span>
          </span>
          <motion.button type="button" className="btn btn-ghost" onClick={logout} whileTap={{ scale: 0.95 }}>
            <LogOut size={17} />
            ログアウト
          </motion.button>
        </div>
      }
    >
      <nav id="side-menu" aria-label="メインメニュー" className="menu">
        <Link href="/" className="menu-item" aria-current={location === '/' ? 'page' : undefined} onClick={onClose}>
          <span className="menu-icon">
            <Home size={19} />
          </span>
          ホーム
        </Link>

        <Accordion id="menu:lists" title="リスト" icon={<Layers size={18} />} defaultOpen>
          {lists.isPending ? (
            <MenuListSkeleton />
          ) : (
            <ul className="menu-lists">
              {lists.data?.map((l, i) => (
                <motion.li
                  key={l.id}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.04 * i + 0.08, type: 'spring', stiffness: 500, damping: 36 }}
                >
                  <Link
                    href={`/lists/${l.id}`}
                    className="menu-item"
                    aria-current={current(`/lists/${l.id}`)}
                    onClick={onClose}
                  >
                    <img className="menu-thumb" src={coverUrl(l.cover)} alt="" />
                    <span className="menu-label">{l.name}</span>
                    <span className="menu-count" aria-label={`未完了 ${l.counts.todo + l.counts.doing}件`}>
                      {l.counts.todo + l.counts.doing}
                    </span>
                  </Link>
                </motion.li>
              ))}
            </ul>
          )}
          <motion.button type="button" className="menu-item menu-add" onClick={onCreateList} whileTap={{ scale: 0.97 }}>
            <span className="menu-icon">
              <Plus size={18} />
            </span>
            新しいリスト
          </motion.button>
        </Accordion>

        <Accordion id="menu:view" title="表示" icon={<Sliders size={18} />} defaultOpen={false}>
          <div className="menu-settings">
            <RadioGroup
              legend="完了したタスク"
              name="show-done"
              value={prefs.showDone ? 'show' : 'hide'}
              onChange={(v) => prefs.setShowDone(v === 'show')}
              options={[
                { value: 'show', label: '表示' },
                { value: 'hide', label: '非表示' },
              ]}
            />
          </div>
        </Accordion>
      </nav>
    </Modal>
  );
}
