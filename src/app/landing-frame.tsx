type LandingFrameProps = {
  hash?: string;
  src?: string;
  title?: string;
};

export function LandingFrame({
  hash = "",
  src = "/corpogn-landing.html",
  title = "Corpogn CSR Management Software and Consultancy",
}: LandingFrameProps) {
  return (
    <main className="h-screen w-full overflow-hidden bg-white">
      <iframe
        src={`${src}${hash}`}
        title={title}
        className="h-full w-full border-0"
      />
    </main>
  );
}
