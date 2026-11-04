// One place that turns a stored notification (type + data) into display text — used
// server-side for the push itself and client-side for the Home bell's history list,
// so the two never drift apart.

export type QuizKind = "reading" | "listening" | "grammar";

export type NotificationType =
  | "friend_request"
  | "friend_accepted"
  | "friend_joined"
  | "friend_goal"
  | "friend_milestone"
  | "friend_quiz"
  | "streak_reminder";

export type NotificationData = { name?: string; streak?: number; quiz?: QuizKind };

export const STREAK_MILESTONES = [7, 14, 30, 50, 100, 150, 200, 365, 500, 1000];

const QUIZ_LABEL: Record<QuizKind, string> = { reading: "Reading", listening: "Listening", grammar: "Grammar" };
const QUIZ_EMOJI: Record<QuizKind, string> = { reading: "📖", listening: "🎧", grammar: "📝" };

export function notificationText(
  type: NotificationType,
  data: NotificationData,
): { emoji: string; title: string; body: string } {
  const name = data.name || "Someone";
  switch (type) {
    case "friend_request":
      return { emoji: "👋", title: "New friend request", body: `${name} wants to be friends` };
    case "friend_accepted":
      return { emoji: "🤝", title: "Friend request accepted", body: `${name} accepted your friend request!` };
    case "friend_joined":
      return data.name
        ? { emoji: "🎉", title: `${data.name} joined from your invite`, body: "They're now in your Study Circle. Tap to see their progress." }
        : { emoji: "🎉", title: "A friend joined from your invite", body: "You're now friends. Tap to see who joined!" };
    case "friend_goal":
      return { emoji: "✅", title: `${name} hit their daily goal`, body: `${data.streak ?? 1}-day streak and counting. Your turn!` };
    case "friend_milestone":
      return { emoji: "🔥", title: `${name} reached a ${data.streak}-day streak!`, body: "Send them some respect, then keep yours going." };
    case "friend_quiz": {
      const quiz = data.quiz ?? "reading";
      return { emoji: QUIZ_EMOJI[quiz], title: `${name} finished ${QUIZ_LABEL[quiz]}`, body: `They did today's ${QUIZ_LABEL[quiz].toLowerCase()} quiz.` };
    }
    case "streak_reminder":
      return { emoji: "⏰", title: "Your streak is at risk", body: `Finish today's goal to keep your ${data.streak ?? 0}-day streak alive.` };
  }
}

// Where tapping the notification (push or history row) should take you.
export function notificationUrl(type: NotificationType, actorId: string | null): string {
  if (type === "streak_reminder") return "/study";
  if (type === "friend_request" || !actorId) return "/";
  return `/friends/${actorId}`;
}
