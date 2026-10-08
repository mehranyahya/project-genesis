import {
  StaticPageView,
  ContactDetailsList,
  ContentBlockedState,
} from "@/components/static-pages/static-pages";
import type { ContactPageModel } from "@/lib/static-pages";
import { useRouteData } from "../shared";

export function ContactRoute() {
  const model = useRouteData<ContactPageModel | undefined>();
  if (!model?.page) return <ContentBlockedState />;
  return (
    <StaticPageView page={model.page}>
      <ContactDetailsList entries={model.details} />
    </StaticPageView>
  );
}
