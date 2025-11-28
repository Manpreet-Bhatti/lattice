package sync

// Represents the type of sync message
type MessageType byte

const (
	// Used for Yjs sync protocol messages
	MessageTypeSync MessageType = 0

	// Used for awareness protocol messages (cursors, presence)
	MessageTypeAwareness MessageType = 1

	// Used for authentication messages
	MessageTypeAuth MessageType = 2
)

// SyncStep represents the step in the Yjs sync protocol
type SyncStep byte

const (
	// Client sends state vector
	SyncStep1 SyncStep = 0

	// Server responds with missing updates
	SyncStep2 SyncStep = 1

	// Regular update broadcast
	SyncUpdate SyncStep = 2
)

// Extracts the message type from the first byte
func ParseMessageType(data []byte) MessageType {
	if len(data) == 0 {
		return MessageTypeSync
	}
	return MessageType(data[0])
}

// Rxtracts the sync step from the second byte
func ParseSyncStep(data []byte) SyncStep {
	if len(data) < 2 {
		return SyncStep1
	}
	return SyncStep(data[1])
}
