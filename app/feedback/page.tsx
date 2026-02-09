import FeedbackClient from "./FeedbackClient";

export default async function FeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const params = await searchParams;
  return <FeedbackClient sessionId={params.id ?? ""} />;
}
