import { ButtonLink, Container } from "@/components/ui";

export default function NotFound() {
  return (
    <Container className="py-24 text-center">
      <p className="font-display text-6xl font-extrabold text-aqua">404</p>
      <h1 className="mt-4 text-3xl font-bold">This page has gone down the drain</h1>
      <p className="mt-3 text-slate">The page you&apos;re looking for doesn&apos;t exist.</p>
      <ButtonLink href="/" className="mt-8">
        Back to home
      </ButtonLink>
    </Container>
  );
}
