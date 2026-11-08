import { motion } from 'motion/react';
import { useState } from 'react';
import { GoogleG } from '../components/Icons';

export function LoginScreen() {
  const [error] = useState(() => {
    const p = new URLSearchParams(location.search);
    const e = p.get('login_error');
    if (e) history.replaceState(null, '', location.pathname);
    return e;
  });

  return (
    <main className="login">
      <motion.div
        className="login-card glass"
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 28 }}
      >
        <motion.img
          src="/icon.svg"
          alt=""
          className="login-icon"
          initial={{ scale: 0.6, rotate: -12 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 16, delay: 0.08 }}
        />
        <h1 className="login-title">Glass Tasks</h1>
        {error && (
          <p className="login-error" role="alert">
            ログインできませんでした
          </p>
        )}
        <motion.a href="/auth/login" className="google-btn" whileTap={{ scale: 0.96 }} whileHover={{ y: -1 }}>
          <GoogleG />
          Googleでログイン
        </motion.a>
      </motion.div>
    </main>
  );
}
