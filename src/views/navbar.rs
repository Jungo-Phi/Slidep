use crate::Route;
use dioxus::prelude::*;

const NAVBAR_CSS: Asset = asset!("/assets/styling/navbar.css");
const LOGO_SVG: Asset = asset!("/assets/slidep-logo.svg");

/// The Navbar component that will be rendered on all pages of our app since every page is under the layout.
///
///
/// This layout component wraps the UI of [Route::Home] and [Route::Blog] in a common navbar. The contents of the Home and Blog
/// routes will be rendered under the outlet inside this component
#[component]
pub fn Navbar() -> Element {
    rsx! {
        document::Link { rel: "stylesheet", href: NAVBAR_CSS }
        div {
            id: "navbar",
            img { src: LOGO_SVG, id: "logo" }
            Link { to: Route::Home {}, "Home" }
            Link { to: Route::Kinematics {}, "Kinematics" }
            Link { to: Route::Blog { id: 1 }, "Blog" }
        }
        Outlet::<Route> {}
    }
}
