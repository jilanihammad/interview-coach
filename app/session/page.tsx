import SessionClient from "./SessionClient";

export default async function SessionPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const params = await searchParams;
  return <SessionClient sessionId={params.id ?? ""} />;
}
