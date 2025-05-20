use dioxus::prelude::*;
use dioxus_elements::geometry::ElementSpace;
use dioxus_elements::geometry::euclid::{Point2D, Transform2D, Angle};
use dioxus_elements::input_data::MouseButton;

use dioxus::web::WebEventExt;
use wasm_bindgen::prelude::*;


#[derive(Clone)]
enum Mode {
    Idle,
    PlacingPivot,
    PlacingSlider,
    PlacingGround,
    PlacingBeamStart,
    PlacingBeamEnd { start: Point2D<f64, ElementSpace> },
}


enum KinElement {
    Beam,
    Slider,
    Pivot,
    Slidep,
}

struct WorldSpace;

#[derive(Copy, Clone)]
struct KinSpace {
    nodes: Signal<Vec<Point2D<f64, ElementSpace>>>,
    beams: Signal<Vec<(usize, usize)>>, // (node, node)
    coincidences: Signal<Vec<(usize, usize)>>, // (node, beam)
    fixations: Signal<Vec<(usize, usize)>>, // (beam, beam)
    sliders: Signal<Vec<(usize, Vec<usize>)>>, // (node, beam)
    pivots: Signal<Vec<(usize, Vec<usize>)>>, // (node, beams)
    grounds: Signal<Vec<(usize, KinElement, usize)>>, // (node, kin:element+id)
}

impl KinSpace {
    fn new() -> Self {
        Self {
            nodes: Signal::new(Vec::new()),
            beams: Signal::new(Vec::new()),
            coincidences: Signal::new(Vec::new()),
            fixations: Signal::new(Vec::new()),
            sliders: Signal::new(Vec::new()),
            pivots: Signal::new(Vec::new()),
            grounds: Signal::new(Vec::new()),
        }
    }
}


fn close_to_node(pos: Point2D<f64, ElementSpace>) -> Option<usize> {
    let nodes = use_context::<KinSpace>().nodes;
    for (node, node_pos) in nodes.iter().enumerate() {
        if node_pos.distance_to(pos) < 12. { return Some(node); }
    }
    return None;
}


fn place_objects(mut mode: Signal<Mode>, mouse_pos: Point2D<f64, ElementSpace>) -> Element {
    let mut nodes = use_context::<KinSpace>().nodes;
    let mut beams = use_context::<KinSpace>().beams;
    let mut pivots = use_context::<KinSpace>().pivots;
    
    match mode() {
        Mode::PlacingPivot => {
            rsx! {
                circle { cx: mouse_pos.x, cy: mouse_pos.y, r: 8, fill: "#ffbe80", stroke: "#001d59", stroke_width: 2 }
                circle { cx: mouse_pos.x, cy: mouse_pos.y, r: 4, fill: "#ffedc6", stroke: "#001d59", stroke_width: 2 }
            }
        }
        Mode::PlacingSlider => {
            rsx! {
                rect { x: mouse_pos.x - 13., y: mouse_pos.y - 7., width: 26, height: 14, fill: "#ffbe80", stroke: "#001d59", stroke_width: 2, rx: 2 }
                rect { x: mouse_pos.x - 8., y: mouse_pos.y - 3., width:16, height: 6, fill: "#ffedc6", stroke: "#001d59", stroke_width: 2, rx: 1 }
            }
        }
        Mode::PlacingBeamStart => {
            let pos = if let Some(node) = close_to_node(mouse_pos) {
                nodes.read()[node]
            } else { mouse_pos };
            rsx! {
                rect {
                    onmousedown: move |event: MouseEvent| { if event.held_buttons() == MouseButton::Primary {
                        mode.set(Mode::PlacingBeamEnd { start: pos });
                    } },
                    x: pos.x - 4., y: pos.y - 4., width: 8, height: 8, fill: "#b7e2ff", stroke: "#001d59", stroke_width: 2
                }
            }
        }
        Mode::PlacingBeamEnd { start } => {
            let end = if let Some(node) = close_to_node(mouse_pos) {
                nodes.read()[node]
            } else { mouse_pos };
            let delta = end - start;
            let angle = delta.angle_from_x_axis();
            let rot_pos: Point2D<f64, ElementSpace> = Transform2D::new(1., 0., 0., 1., 0., 0.).then_rotate(-angle).transform_point(start);
            rsx! {
                rect {
                    onmousedown: move |event: MouseEvent| { if event.held_buttons() == MouseButton::Primary {
                        let start_id = if let Some(start_id) = nodes().iter().position(|&pos| pos == start) {
                            let mut adjascent_beams = vec![beams.len()];
                            for (beam_id, beam) in beams.iter().enumerate() {
                                if (start_id == beam.0) || (start_id == beam.1) { adjascent_beams.push(beam_id) }
                            }
                            pivots.push((start_id, adjascent_beams));
                            start_id
                        } else {
                            nodes.push(start);
                            nodes.len() - 1
                        };
                        let end_id = if let Some(end_id) = nodes().iter().position(|&pos| pos == end) {
                            let mut adjascent_beams = vec![beams.len()];
                            for (beam_id, beam) in beams.iter().enumerate() {
                                if (end_id == beam.0) || (end_id == beam.1) { adjascent_beams.push(beam_id) }
                            }
                            pivots.push((end_id, adjascent_beams));
                            end_id
                        } else {
                            nodes.push(end);
                            nodes.len() - 1
                        };
                        beams.push((start_id, end_id));
                        mode.set(Mode::PlacingBeamStart);
                    } },
                    x: rot_pos.x, y: rot_pos.y - 4., width: start.distance_to(end), height: 8, fill: "#b7e2ff", stroke: "#001d59", stroke_width: 2, transform: "rotate({angle.to_degrees()})" }
            }
        }
        _ => rsx! {}
    }
}


fn draw_beam(start: Point2D<f64, ElementSpace>, end: Point2D<f64, ElementSpace>) -> Element {
    let delta = end - start;
    let angle = delta.angle_from_x_axis();
    let pos: Point2D<f64, ElementSpace> = Transform2D::new(1., 0., 0., 1., 0., 0.).then_rotate(-angle).transform_point(start);
    rsx!{
        rect {
            x: pos.x, y: pos.y - 4., width: start.distance_to(end), height: 8, fill: "#b7e2ff", stroke: "#001d59", stroke_width: 2, transform: "rotate({angle.to_degrees()})"
        }
    }
}


fn draw_pivot(pos: Point2D<f64, ElementSpace>) -> Element {
    rsx! {
        circle { cx: pos.x, cy: pos.y, r: 8, fill: "#ffbe80", stroke: "#001d59", stroke_width: 2 }
        circle { cx: pos.x, cy: pos.y, r: 4, fill: "#b7e2ff", stroke: "#001d59", stroke_width: 2 }
    }
}


#[component]
pub fn Kinematics() -> Element {
    let mut debug = use_signal(|| "".to_string());
    let mut mode = use_signal(|| Mode::Idle);
    let mut mouse_pos = use_signal(|| Point2D::zero());
    let kin_space = use_context_provider(|| KinSpace::new());
    
    use_effect(move || {
        let keydown_handler = Closure::wrap(Box::new(move |event: web_sys::KeyboardEvent| {
            debug.set(format!("Key pressed: {} - nodes:{:?} beams:{:?}", event.code(), kin_space.nodes.read(), kin_space.beams.read()));
            if !event.ctrl_key() {
                if event.code() == "Escape" { mode.set(Mode::Idle) }
            }
        }) as Box<dyn FnMut(_)>);
        
        web_sys::window()
            .unwrap()
            .add_event_listener_with_callback("keydown", keydown_handler.as_ref().unchecked_ref())
            .unwrap();
        keydown_handler.forget();
        (|| {})()
    });
    
    rsx! {
        div { dir: "ltr", fill: "#ffbe80",
            button { onclick: move |_| { }, "Clear all" }
            button { onclick: move |_| { mode.set(Mode::PlacingPivot) }, "Pivot" }
            button { onclick: move |_| { mode.set(Mode::PlacingSlider) }, "Slider" }
            button { onclick: move |_| { mode.set(Mode::PlacingGround) }, "Ground" }
            button { onclick: move |_| { mode.set(Mode::PlacingBeamStart) }, "Beam" }
            " debug: {debug}"
        }
        div{ tabindex: "0", style: "height: 100vh; outline: none;",
            svg { width: "100%", height: "100%",
                onmousemove: move |event: MouseEvent| {
                    mouse_pos.set(event.element_coordinates());
                },
                circle { cx: 500, cy: 620, r: 50, fill: "#db5000" }
                
                for (start_node, end_node) in kin_space.beams.read().iter() {
                    {draw_beam(kin_space.nodes.read()[*start_node], kin_space.nodes.read()[*end_node])}
                }
                
                for (node, beams) in kin_space.pivots.read().iter() {
                    {draw_pivot(kin_space.nodes.read()[*node])}
                }
                
                { place_objects(mode, mouse_pos()) }
            }
        }
    }
}
