import Image from "next/image";
import masterPlumbers from "../../public/badges/master-plumbers.png";
import totika from "../../public/badges/totika.png";
import { Container } from "./ui";

// Accreditations shown on plumbing360.co.nz.
export function TrustBand() {
  return (
    <section className="bg-slate text-white">
      <Container className="py-14 text-center">
        <h2 className="text-2xl font-bold text-aqua sm:text-3xl">A relationship you can trust</h2>
        <p className="mt-2 text-white/80">We&apos;re tested and affiliated with the following</p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-12 gap-y-6">
          <Image src={totika} alt="Tōtika, accredited by Qualify365" className="h-24 w-auto" sizes="100px" />
          <Image src={masterPlumbers} alt="Master Plumbers: Representing Excellence" className="h-14 w-auto" sizes="160px" />
        </div>
      </Container>
    </section>
  );
}
