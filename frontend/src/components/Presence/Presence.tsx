import { useMemo } from "react";
import styles from "./Presence.module.css";

interface User {
  id: string;
  name: string;
  color: string;
  isYou?: boolean;
  isTyping?: boolean;
}

interface PresenceProps {
  users: User[];
}

function getInitials(name: string): string {
  const parts = name.match(/[A-Z][a-z]*/g) || [name.slice(0, 2)];
  if (parts.length >= 2) {
    return parts[0][0] + parts[1][0];
  }
  return name.slice(0, 2).toUpperCase();
}

function UserAvatar({ user }: { user: User }) {
  const initials = useMemo(() => getInitials(user.name), [user.name]);

  return (
    <div
      className={`${styles.avatar} ${user.isYou ? styles.isYou : ""}`}
      style={{
        backgroundColor: user.color,
        boxShadow: `0 0 0 2px var(--lattice-bg-surface), 0 0 0 3px ${user.color}40`,
      }}
      title={user.isYou ? `${user.name} (You)` : user.name}
    >
      <span className={styles.initials}>{initials}</span>
      {user.isTyping && !user.isYou && (
        <span className={styles.typingDot}>
          <span />
          <span />
          <span />
        </span>
      )}
    </div>
  );
}

export function Presence({ users }: PresenceProps) {
  const typingUsers = users.filter((u) => u.isTyping && !u.isYou);

  return (
    <div className={styles.presenceBar}>
      <div className={styles.leftSection}>
        <div className={styles.avatarStack}>
          {users.slice(0, 5).map((user, index) => (
            <div
              key={user.id}
              className={styles.avatarWrapper}
              style={{ zIndex: users.length - index }}
            >
              <UserAvatar user={user} />
            </div>
          ))}
          {users.length > 5 && (
            <div className={styles.moreUsers}>+{users.length - 5}</div>
          )}
        </div>

        {typingUsers.length > 0 && (
          <div className={styles.typingIndicator}>
            <span className={styles.typingText}>
              {typingUsers.length === 1
                ? `${typingUsers[0].name} is typing`
                : typingUsers.length === 2
                  ? `${typingUsers[0].name} and ${typingUsers[1].name} are typing`
                  : `${typingUsers.length} people are typing`}
            </span>
            <span className={styles.typingDots}>
              <span />
              <span />
              <span />
            </span>
          </div>
        )}
      </div>

      <div className={styles.rightSection}>
        <div className={styles.userList}>
          {users.map((user) => (
            <div
              key={user.id}
              className={`${styles.userChip} ${user.isYou ? styles.isYouChip : ""}`}
              style={{ borderColor: `${user.color}60` }}
            >
              <span
                className={styles.colorDot}
                style={{ backgroundColor: user.color }}
              />
              <span className={styles.userName}>
                {user.name}
                {user.isYou && <span className={styles.youBadge}>(you)</span>}
              </span>
            </div>
          ))}
        </div>
        <div className={styles.userCount}>
          <span className={styles.onlineDot} />
          {users.length} online
        </div>
      </div>
    </div>
  );
}
