import { HomeHero } from "./home-hero";
import {
  HomeBuildingStone,
  HomeChoicePaths,
  HomeFeaturedProducts,
  HomeFinalCta,
  HomeGuide,
  HomePortfolio,
  HomeProcess,
} from "./home-sections";
import type { HomeViewModel } from "@/lib/home";

export function HomePage({ model }: { model: HomeViewModel }) {
  return (
    <>
      <HomeHero media={model.heroMedia} />
      <HomeChoicePaths />
      <HomeProcess />
      {model.showProducts ? <HomeFeaturedProducts products={model.products} /> : null}
      {model.showPortfolio ? <HomePortfolio /> : null}
      {model.showGuide && model.guide ? <HomeGuide guide={model.guide} /> : null}
      <HomeBuildingStone />
      <HomeFinalCta />
    </>
  );
}
