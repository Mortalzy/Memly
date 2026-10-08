import { useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { PageHeading } from '../shared/ui';
import { ru } from '../shared/ru';
import { errorMessage } from '../shared/api';
import type { UserDto } from '@memly/contracts';

export function Settings({
  dark,
  setDark,
  saved,
  user,
  saveProfile,
}: {
  dark: boolean;
  setDark: (value: boolean) => void;
  saved: () => void;
  user?: UserDto;
  saveProfile?: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState(user?.name ?? 'Максим');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [reminder, setReminder] = useState(true);
  return (
    <>
      <PageHeading title={ru.settings} subtitle={ru.profileHint} />
      <div className="settings-grid">
        <form
          className="panel settings-panel"
          onSubmit={async (event) => {
            event.preventDefault();
            if (pending) return;
            setPending(true);
            setError('');
            try {
              await saveProfile?.(name);
              saved();
            } catch (error) {
              setError(errorMessage(error));
            } finally {
              setPending(false);
            }
          }}
        >
          <h2>{ru.profileSettings}</h2>
          <div className="profile-summary">
            <span className="avatar large">М</span>
            <div>
              <strong>{user?.name ?? ru.account}</strong>
              <p>{ru.accountHint}</p>
            </div>
          </div>
          <label>
            {ru.name}
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              minLength={2}
              maxLength={100}
              required
            />
          </label>
          <label>
            {ru.email}
            <input
              type="email"
              defaultValue={user?.email ?? 'maxim@example.com'}
              readOnly={Boolean(user)}
              required
            />
          </label>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <button className="primary" type="submit" disabled={pending}>
            {ru.saveChanges}
          </button>
        </form>
        <div className="settings-right">
          <section className="panel settings-panel">
            <h2>{ru.appearance}</h2>
            <p>{ru.themeHint}</p>
            <div className="theme-options">
              <button className={!dark ? 'active' : ''} onClick={() => setDark(false)}>
                <Sun size={23} />
                {ru.lightTheme}
              </button>
              <button className={dark ? 'active' : ''} onClick={() => setDark(true)}>
                <Moon size={23} />
                {ru.darkTheme}
              </button>
            </div>
          </section>
          {!user && (
            <section className="panel settings-panel">
              <h2>{ru.notifications}</h2>
              <p>{ru.notificationsHint}</p>
              <div className="switch-row">
                <span>{ru.reminder}</span>
                <button
                  role="switch"
                  aria-checked={reminder}
                  aria-label={ru.reminder}
                  className={`switch ${reminder ? 'on' : ''}`}
                  onClick={() => setReminder(!reminder)}
                >
                  <span />
                </button>
              </div>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
