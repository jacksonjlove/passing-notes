import React, { useEffect, useState } from "react";
import { api } from "./api.js";
import Icon from "./components/Icon.jsx";
import AccountForm from "./components/AccountForm.jsx";
import GroupList from "./components/GroupList.jsx";
import RoundPage from "./components/RoundPage.jsx";
export default function App() {
  const [user, setUser] = useState(null),
    [loading, setLoading] = useState(true),
    [groups, setGroups] = useState([]),
    [selected, setSelected] = useState(null),
    [error, setError] = useState("");
  const [invite] = useState(() =>
    new URLSearchParams(location.search).get("invite"),
  );
  async function refresh() {
    try {
      const data = await api("/groups");
      setGroups(data.groups);
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    api("/auth/me")
      .then((data) => setUser(data.user))
      .catch((e) => {
        if (e.status !== 401) setError(e.message);
      })
      .finally(() => setLoading(false));
    const expired = () => {
      setUser(null);
      setSelected(null);
    };
    window.addEventListener("session-expired", expired);
    return () => window.removeEventListener("session-expired", expired);
  }, []);
  useEffect(() => {
    if (user) refresh();
  }, [user]);
  async function logout() {
    try {
      await api("/auth/logout", { method: "POST", body: {} });
      setUser(null);
      setSelected(null);
      setGroups([]);
    } catch (e) {
      setError(e.message);
    }
  }
  const group = groups.find((g) => g.id === selected);
  return (
    <div className="app">
      <header className="topbar">
        <button
          className="brand"
          onClick={() => {
            setSelected(null);
            if (user) refresh();
          }}
          aria-label="Passing Notes home"
        >
          <span className="brand-mark">
            <Icon name="note" size={22} />
          </span>
          Passing Notes<span className="brand-dots">...</span>
        </button>
        <div className="topbar-right">
          {user ? (
            <>
              <span className="user-chip">
                <span className="avatar">
                  {user.displayName.slice(0, 1).toUpperCase()}
                </span>
                <span>{user.displayName}</span>
              </span>
              <button
                className="icon-button"
                onClick={logout}
                aria-label="Sign out"
                title="Sign out"
              >
                <Icon name="logout" />
              </button>
            </>
          ) : (
            <span className="tagline">For the people who know you best.</span>
          )}
        </div>
      </header>
      <main>
        {loading ? (
          <div className="loading">Opening the notebook…</div>
        ) : !user ? (
          <AccountForm invite={invite} onSignedIn={setUser} />
        ) : group ? (
          <RoundPage
            group={group}
            user={user}
            onBack={() => {
              setSelected(null);
              refresh();
            }}
            onUpdate={refresh}
          />
        ) : (
          <GroupList
            user={user}
            groups={groups}
            invite={invite}
            onRefresh={refresh}
            onOpen={setSelected}
          />
        )}{" "}
        {error && (
          <div className="global-error error" role="alert">
            {error}
            <button
              className="text-button"
              onClick={() => {
                setError("");
                if (user) refresh();
                else location.reload();
              }}
            >
              Retry
            </button>
          </div>
        )}
      </main>
      <footer>
        <span>Passing Notes...</span>
        <span>Small notes. Good company.</span>
      </footer>
    </div>
  );
}
