use dioxus::prelude::*;
use crate::Route;


#[component]
pub fn Hero() -> Element {
    let mut message = use_signal(|| "".to_string());
    
    rsx! {
        div {
            id: "hero",
            div { id: "links",
                Link { to: Route::Kinematics {}, "🚀 Kinematics" }
                Link { to: Route::Blog { id: 1 }, "Blog" }
            }
            h2 { display: "flex", justify_content: "center", font_family: "Helvetica", "Message: {message.read()}" }
            div { display: "flex", justify_content: "center",
                button { onclick: move |_| { message.set("start".to_string()) }, "Start" }
                button { onclick: move |_| { message.set("stop".to_string()) }, "Stop" }
            }
        }
    }
}
