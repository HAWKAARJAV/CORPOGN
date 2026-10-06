import NgoFullProfile from "./ngo-full-profile";

export default async function NgoFullProfilePage({
  params,
}: {
  params: Promise<{ slug: string; ngoId: string }>;
}) {
  const { slug, ngoId } = await params;
  return <NgoFullProfile corporateSlug={slug} ngoId={ngoId} />;
}
