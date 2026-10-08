import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { authClient } from '../features/auth';
import { api, errorMessage } from '../shared/api';

export function AuthPage({ signedIn }: { signedIn: () => Promise<void> }) {
  const token = new URLSearchParams(window.location.search).get('token');
  const [mode, setMode] = useState<'login' | 'register' | 'forgot' | 'reset'>(
    token ? 'reset' : 'login',
  );
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const settings = useQuery({
    queryKey: ['config'],
    queryFn: () => api<{ emailEnabled: boolean }>('/config'),
  });
  const titles = {
    login: 'С возвращением',
    register: 'Начните учиться с Memly',
    forgot: 'Восстановление доступа',
    reset: 'Новый пароль',
  };
  return (
    <main className="auth-screen">
      <section className="panel auth-panel">
        <span className="brand">
          Memly
          <span className="brand-dot" />
        </span>
        <h1>{titles[mode]}</h1>
        <p>Ваши карточки — в вашем ритме.</p>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setPending(true);
            setError('');
            setMessage('');
            try {
              const result =
                mode === 'register'
                  ? await authClient.signUp.email({
                      name,
                      email,
                      password,
                      callbackURL: window.location.origin,
                    })
                  : mode === 'forgot'
                    ? await authClient.requestPasswordReset({
                        email,
                        redirectTo: `${window.location.origin}/?reset=1`,
                      })
                    : mode === 'reset'
                      ? await authClient.resetPassword({
                          newPassword: password,
                          token: token ?? '',
                        })
                      : await authClient.signIn.email({ email, password });
              if (result.error) {
                const code = result.error.code;
                throw new Error(
                  code === 'INVALID_EMAIL_OR_PASSWORD'
                    ? 'Неверная почта или пароль'
                    : code === 'EMAIL_NOT_VERIFIED'
                      ? 'Подтвердите почту по ссылке в письме'
                      : code === 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL'
                        ? 'Не удалось создать аккаунт с этой почтой'
                        : (result.error.message ?? 'Не удалось войти'),
                );
              }
              if (mode === 'forgot')
                setMessage('Если аккаунт существует, письмо с инструкцией отправлено.');
              else if (mode === 'reset') {
                window.history.replaceState(null, '', '/');
                setMode('login');
                setPassword('');
                setMessage('Пароль изменён. Войдите в аккаунт.');
              } else if (mode === 'register' && settings.data?.emailEnabled)
                setMessage('Подтвердите почту по ссылке в письме, затем войдите.');
              else await signedIn();
            } catch (error) {
              setError(errorMessage(error));
            } finally {
              setPending(false);
            }
          }}
        >
          {mode === 'register' && (
            <label>
              Имя
              <input
                autoComplete="name"
                minLength={2}
                maxLength={100}
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </label>
          )}
          {mode !== 'reset' && (
            <label>
              Электронная почта
              <input
                type="email"
                autoComplete="email"
                maxLength={254}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
          )}
          {mode !== 'forgot' && (
            <label>
              Пароль
              <input
                type="password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                minLength={mode === 'login' ? 1 : 10}
                maxLength={128}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              {mode !== 'login' && <small>Не менее 10 символов</small>}
            </label>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {message && <p role="status">{message}</p>}
          <button
            className="primary"
            disabled={pending || (mode === 'register' && settings.isPending)}
          >
            {pending
              ? 'Подождите…'
              : mode === 'register'
                ? 'Создать аккаунт'
                : mode === 'forgot'
                  ? 'Отправить письмо'
                  : mode === 'reset'
                    ? 'Сохранить пароль'
                    : 'Войти'}
          </button>
        </form>
        <button
          className="text-button"
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login');
            setError('');
            setMessage('');
          }}
        >
          {mode === 'login' ? 'Создать аккаунт' : 'Уже есть аккаунт? Войти'}
        </button>
        {mode === 'login' && settings.data?.emailEnabled && (
          <button className="text-button" onClick={() => setMode('forgot')}>
            Забыли пароль?
          </button>
        )}
      </section>
    </main>
  );
}
