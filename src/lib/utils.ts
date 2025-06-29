import type { Rod, GrabElem, HoverOn, KinState, RodPos } from '$lib/types';

export function is_rod_in_elem(rod: Rod, elem: GrabElem): boolean {
	switch (elem.type) {
		case 'rod pos':
			if (elem.rod === rod) {
				return true;
			}
			break;
		case 'slider':
			if (elem.fixedRods.map(([rodPos, dir]) => rodPos.rod).includes(rod)) {
				return true;
			}
			if (elem.slideRod === rod) {
				return true;
			}
			break;
		case 'slidep':
			if (elem.rotRods.map((rodPos) => rodPos.rod).includes(rod)) {
				return true;
			}
			if (elem.slideRod === rod) {
				return true;
			}
			break;
		case 'pivot':
			if (elem.rotRods.map((rodPos) => rodPos.rod).includes(rod)) {
				return true;
			}
			break;
		case 'fixation':
			if (elem.fixedRods.map(([rodPos, dir]) => rodPos.rod).includes(rod)) {
				return true;
			}
	}
	return false;
}

export function erase(kinState: KinState, hoverOn: HoverOn) {
	switch (hoverOn.type) {
		case 'rod pos':
		case 'rod end':
			let rod = (hoverOn.type == 'rod pos') ? hoverOn.rodPos.rod : hoverOn.rod;
			let deletedRod = kinState.rods.splice(kinState.rods.indexOf(rod), 1)[0];
			deletedRod.objects.forEach(([object, k]) => {
				switch (object.type) {
					case 'slider':
						if (object.slideRod !== undefined) {
							object.slideRod = undefined;
						} else {
							object.fixedRods.splice(object.fixedRods.map(obj => obj[0].rod).indexOf(deletedRod));
						}
						break;
					case 'slidep':
						if (object.slideRod !== undefined) {
							object.slideRod = undefined;
						} else {
							object.rotRods.splice(object.rotRods.map(obj => obj.rod).indexOf(deletedRod));
						}
						break;
					case 'pivot':
						object.rotRods.splice(object.rotRods.map(obj => obj.rod).indexOf(deletedRod));
						break;
					case 'fixation':
						object.fixedRods.splice(object.fixedRods.map(obj => obj[0].rod).indexOf(deletedRod));
				}
			});
			break;
		case 'slider':
			let deletedSlider = kinState.sliders.splice(kinState.sliders.indexOf(hoverOn.object), 1)[0];
			deletedSlider.fixedRods.forEach(([rodPos, dir]) => {
				rodPos.rod.objects.splice(rodPos.rod.objects.map(obj => obj[0]).indexOf(deletedSlider));
			});
			if (deletedSlider.slideRod !== undefined) {
				deletedSlider.slideRod.objects.splice(deletedSlider.slideRod.objects.map(obj => obj[0]).indexOf(deletedSlider));
			}
			break;
		case 'slidep':
			let deletedSlidep = kinState.slideps.splice(kinState.slideps.indexOf(hoverOn.object), 1)[0];
			deletedSlidep.rotRods.forEach(rodPos => {
				rodPos.rod.objects.splice(rodPos.rod.objects.map(obj => obj[0]).indexOf(deletedSlidep));
			});
			if (deletedSlidep.slideRod !== undefined) {
				deletedSlidep.slideRod.objects.splice(deletedSlidep.slideRod.objects.map(obj => obj[0]).indexOf(deletedSlidep));
			}
			break;
		case 'pivot':
			let deletedPivot = kinState.pivots.splice(kinState.pivots.indexOf(hoverOn.object), 1)[0];
			deletedPivot.rotRods.forEach(rodPos => {
				rodPos.rod.objects.splice(rodPos.rod.objects.map(obj => obj[0]).indexOf(deletedPivot));
			});
			break;
		case 'fixation':
			let deletedFixation = kinState.fixations.splice(kinState.fixations.indexOf(hoverOn.object), 1)[0];
			deletedFixation.fixedRods.forEach(([rodPos, dir]) => {
				rodPos.rod.objects.splice(rodPos.rod.objects.map(obj => obj[0]).indexOf(deletedFixation));
			});
	}
}
