use dioxus::prelude::*;
use dioxus_elements::geometry::ElementSpace;
use dioxus_elements::geometry::euclid::{Point2D, Transform2D, Angle};


enum Mode {
    Idle,
    PlacingPivot,
    PlacingSlider,
    PlacingGround,
    PlacingBeam { pos: Option<Point2D<f64, ElementSpace>> },
}


enum KinElement {
    Beam,
    Slider,
    Pivot,
    Slidep,
}

struct WorldSpace;

struct KinSpace {
    nodes: Vec<Point2D<f64, WorldSpace>>,
    beams: Vec<(usize, usize)>, // (node, node)
    coincidences: Vec<(usize, usize)>, // (node, beam)
    fixations: Vec<(usize, usize)>, // (beam, beam)
    sliders: Vec<(usize, Vec<usize>)>, // (node, beam)
    pivots: Vec<(usize, Vec<usize>)>, // (node, beams)
    grounds: Vec<(usize, KinElement, usize)>, // (node, kin:element+id)
}


#[component]
pub fn Kinematics() -> Element {
    let mut debug = use_signal(|| "".to_string());
    let mut mode = use_signal(|| Mode::Idle);
    let mut mouse_pos = use_signal(|| Point2D::zero());
    
    rsx! {
        div { dir: "ltr",
            button { onclick: move |_| { mode.set(Mode::Idle) }, "Escape" }
            button { onclick: move |_| { mode.set(Mode::PlacingPivot) }, "Pivot" }
            button { onclick: move |_| { mode.set(Mode::PlacingSlider) }, "Slider" }
            button { onclick: move |_| { mode.set(Mode::PlacingGround) }, "Ground" }
            button { onclick: move |_| { mode.set(Mode::PlacingBeam { pos: Some(Point2D::new(500., 300.)) }) }, "Beam" }
            " debug: {debug}"
        }
        svg {
            onmousemove: move |event: MouseEvent| { mouse_pos.set(event.element_coordinates()) },
            onkeypress: move |event: KeyboardEvent| { if event.key() == Key::Escape { mode.set(Mode::Idle) }; debug.set(format!("{:?}", event)) },
            width: "1200", height: "600",
            rect { width: "100%", height: "100%", fill: "none", stroke: "#001d59" }
            circle { cx: 500, cy: 620, r: 50, fill: "#db5000" }
            match *mode.read() {
                Mode::PlacingPivot => {
                    rsx! {
                        circle { cx: mouse_pos().x, cy: mouse_pos().y, r: 8, fill: "#ffbe80", stroke: "#001d59", stroke_width: 2 }
                        circle { cx: mouse_pos().x, cy: mouse_pos().y, r: 4, fill: "#ffedc6", stroke: "#001d59", stroke_width: 2 }
                    }
                }
                Mode::PlacingSlider => {
                    rsx! {
                        rect { x: mouse_pos().x - 13., y: mouse_pos().y - 7., width: 26, height: 14, fill: "#ffbe80", stroke: "#001d59", stroke_width: 2, rx: 2 }
                        rect { x: mouse_pos().x - 8., y: mouse_pos().y - 3., width:16, height: 6, fill: "#ffedc6", stroke: "#001d59", stroke_width: 2, rx: 1 }
                    }
                }
                Mode::PlacingBeam { pos } => {
                    if let Some(start_pos) = pos {
                        let delta = mouse_pos() - start_pos;
                        let w = mouse_pos().distance_to(start_pos);
                        let angle = delta.angle_from_x_axis();
                        let rot = Transform2D::new(1., 0., 0., 1., 0., 0.);
                        let rot = rot.then_rotate(-angle);
                        let pos: Point2D<f64, ElementSpace> = rot.transform_point(start_pos);
                        rsx! {
                            rect { x: pos.x, y: pos.y, width: w, height: 20, fill: "#b7e2ff", stroke: "#001d59", stroke_width: 2, transform: "rotate({angle.to_degrees()})" }
                            line { x1: start_pos.x, y1: start_pos.y, x2: mouse_pos().x, y2: mouse_pos().y, style: "stroke:red;stroke-width:2" }
                        }
                    } else {
                        rsx! {
                            rect { x: mouse_pos().x - 4., y: mouse_pos().y - 4., width: 8, height: 8, fill: "#b7e2ff", stroke: "#001d59", stroke_width: 2 }
                        }
                    }
                }
                _ => rsx! {}
            }
        }
    }
}
