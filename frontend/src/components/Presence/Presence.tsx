import styles from "./Presence.module.css";

interface User {
  id: string;
  name: string;
  color: string;
  isYou?: boolean;
}

interface PresenceProps {
  users: User[];
}

export function Presence({ users }: PresenceProps) {
  return (
    <div className={styles.presenceBar}>
      <div className={styles.userList}>
        {users.map((user) => (
          <div
            key={user.id}
            className={`${styles.user} ${user.isYou ? styles.isYou : ""}`}
            title={user.isYou ? `${user.name} (You)` : user.name}
          >
            <span
              className={styles.indicator}
              style={{ backgroundColor: user.color }}
            />
            <span className={styles.name}>
              {user.name}
              {user.isYou && <span className={styles.youBadge}>(You)</span>}
            </span>
          </div>
        ))}
      </div>
      <div className={styles.userCount}>
        {users.length} {users.length === 1 ? "user" : "users"} online
      </div>
    </div>
  );
}
