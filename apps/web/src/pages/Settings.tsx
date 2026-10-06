import { useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { PageHeading } from '../shared/ui';
import { ru } from '../shared/ru';

export function Settings({
  dark,
  setDark,
  saved,
}: {
  dark: boolean;
  setDark: (value: boolean) => void;
  saved: () => void;
}) {
  const [reminder, setReminder] = useState(true);
  return (
    <>
      <PageHeading title={ru.settings} subtitle={ru.profileHint} />
      <div className="settings-grid">
        <form
          className="panel settings-panel"
          onSubmit={(event) => {
            event.preventDefault();
            saved();
          }}
        >
          <h2>{ru.profileSettings}</h2>
          <div className="profile-summary">
            <span className="avatar large">М</span>
            <div>
              <strong>{ru.account}</strong>
              <p>{ru.accountHint}</p>
            </div>
          </div>
          <label>
            {ru.name}
            <input defaultValue="Максим" required />
          </label>
          <label>
            {ru.email}
            <input type="email" defaultValue="maxim@example.com" required />
          </label>
          <button className="primary" type="submit">
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
        </div>
      </div>
    </>
  );
}
