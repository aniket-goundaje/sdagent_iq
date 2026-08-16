import { bootstrapApplication } from "@angular/platform-browser";
import { provideAnimations } from "@angular/platform-browser/animations";
import { provideHttpClient } from "@angular/common/http";
import { provideRouter } from "@angular/router";

import { AppComponent } from "./app/app.component";
import { appRoutes } from "./app/app.routes";

bootstrapApplication(AppComponent, {
  providers: [provideAnimations(), provideHttpClient(), provideRouter(appRoutes)]
}).catch((error) => console.error(error));
