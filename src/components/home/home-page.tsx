import { HomeHero } from "./home-hero";
import {
  HomeChoicePaths,
  HomeFinalCta,
  HomeGuide,
  HomePortfolio,
  HomeProcess,
} from "./home-sections";
import type { HomeViewModel } from "@/lib/home";

export function HomePage({ model }: { model: HomeViewModel }) {
  return (
    <>
      <HomeHero media={model.heroMedia} mobileMedia={model.heroMobileMedia} />
      <HomeChoicePaths media={model.serviceMedia} />
      {model.showPortfolio ? <HomePortfolio projects={model.projects} /> : null}
      <HomeProcess />
      {model.showGuide && model.guide ? <HomeGuide guide={model.guide} /> : null}
      <HomeFinalCta />
    </>
  );
}
