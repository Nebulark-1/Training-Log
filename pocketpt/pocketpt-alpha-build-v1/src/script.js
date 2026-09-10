// // let elements = Array.from(document.querySelectorAll("path"));

// // elements.forEach(function(el) {
// //     el.addEventListener("click", function(){console.log("buttons ready")} )
// //     el.addEventListener("mouseover", function(){console.log("muscles ready too")} )
// //  });

let baseChestSelected = false;
let baseTricepSelected = false;
let baseforearmSelected = false;
let baseshoulderSelected = false;
let basebicepSelected = false;
let baseabsSelected = false;
let baseobliquesSelected = false;
let basetrapsSelected = false;
let basewaistSelected = false;
let basequadsSelected = false;
let basecalvesSelected = false;
let baseadductorsSelected = false;

let majorGroupUpper = false;
let majorGroupLower = false;

let musclesSelected = []

let HTMLMuscList = document.getElementById("muscleName").innerHTML;
let ButtonOn = false;
let majorGroupSelected = false;

function setText() {
  musclesSelected.sort();
  document.getElementById("muscleName").innerHTML = musclesSelected.join(", ")
};

let chestpaths = Array.from(document.querySelectorAll(".chest"));
chestpaths.forEach(function(path) {
  path.addEventListener("click", function() {
    // console.log("clicking chest: ("+ baseChestSelected + " base chest state)(" + baseTricepSelected + " base tricep state)("+ majorGroupUpper + " button-on body state)("+ ButtonOn + " buttonON)");
    chestpaths.forEach(function(chestPath) {
      if (baseChestSelected) {
        chestPath.classList.remove("clicked");
        musclesSelected = musclesSelected.filter(item => item !== "Chest");
        } else {
        chestPath.classList.add("clicked");
        if (!musclesSelected.includes("Chest")) {
          musclesSelected.push("Chest");
          setText();
        }
        }
      setText();
    });
    if (musclesSelected.length < 1) {
      document.getElementById("muscleName").textContent = HTMLMuscList;
    }
    baseChestSelected = !baseChestSelected; 
  });
});

let triceppaths = Array.from(document.querySelectorAll(".triceps"));
triceppaths.forEach(function(path) {
  path.addEventListener("click", function() {

    triceppaths.forEach(function(triPath) {

      if (baseTricepSelected) {
        triPath.classList.remove("clicked");
        musclesSelected = musclesSelected.filter(item => item !== "Triceps");
        
      } else {
        triPath.classList.add("clicked");
        if (!musclesSelected.includes("Triceps")) {
        musclesSelected.push("Triceps");
        setText();
        }
      }
      setText();
    });
    if (musclesSelected.length < 1) {
      document.getElementById("muscleName").textContent = HTMLMuscList;
    }
    baseTricepSelected = !baseTricepSelected; 
  });
});

let forearmpaths = Array.from(document.querySelectorAll(".forearms"));
forearmpaths.forEach(function(path) {
  path.addEventListener("click", function() {

    forearmpaths.forEach(function(triPath) {

      if (baseforearmSelected) {
        triPath.classList.remove("clicked");
        musclesSelected = musclesSelected.filter(item => item !== "Forearms");
        
      } else {
        triPath.classList.add("clicked");
        if (!musclesSelected.includes("Forearms")) {
        musclesSelected.push("Forearms");
        setText();
        }
      }
      setText();
    });
    if (musclesSelected.length < 1) {
      document.getElementById("muscleName").textContent = HTMLMuscList;
    }
    baseforearmSelected = !baseforearmSelected; 
  });
});

let shoulderpaths = Array.from(document.querySelectorAll(".shoulders"));
shoulderpaths.forEach(function(path) {
  path.addEventListener("click", function() {

    shoulderpaths.forEach(function(shoulderPath) {

      if (baseshoulderSelected) {
        shoulderPath.classList.remove("clicked");
        musclesSelected = musclesSelected.filter(item => item !== "Shoulders");
        
      } else {
        shoulderPath.classList.add("clicked");
        if (!musclesSelected.includes("Shoulders")) {
        musclesSelected.push("Shoulders");
        setText();
        }
      }
      setText();
    });
    if (musclesSelected.length < 1) {
      document.getElementById("muscleName").textContent = HTMLMuscList;
    }
    baseshoulderSelected = !baseshoulderSelected; 
  });
});

let abspaths = Array.from(document.querySelectorAll(".abs"));
abspaths.forEach(function(path) {
  path.addEventListener("click", function() {

    abspaths.forEach(function(absPath) {

      if (baseabsSelected) {
        absPath.classList.remove("clicked");
        musclesSelected = musclesSelected.filter(item => item !== "Abs");
        
      } else {
        absPath.classList.add("clicked");
        if (!musclesSelected.includes("Abs")) {
        musclesSelected.push("Abs");
        setText();
        }
      }
      setText();
    });
    if (musclesSelected.length < 1) {
      document.getElementById("muscleName").textContent = HTMLMuscList;
    }
    baseabsSelected = !baseabsSelected; 
  });
});

let biceppaths = Array.from(document.querySelectorAll(".biceps"));
biceppaths.forEach(function(path) {
  path.addEventListener("click", function() {

    biceppaths.forEach(function(bicepPath) {

      if (basebicepSelected) {
        bicepPath.classList.remove("clicked");
        musclesSelected = musclesSelected.filter(item => item !== "Biceps");
        
      } else {
        bicepPath.classList.add("clicked");
        if (!musclesSelected.includes("Biceps")) {
        musclesSelected.push("Biceps");
        setText();
        }
      }
      setText();
    });
    if (musclesSelected.length < 1) {
      document.getElementById("muscleName").textContent = HTMLMuscList;
    }
    basebicepSelected = !basebicepSelected; 
  });
});

let obliquespaths = Array.from(document.querySelectorAll(".obliques"));
obliquespaths.forEach(function(path) {
  path.addEventListener("click", function() {

    obliquespaths.forEach(function(obliquesPath) {

      if (baseobliquesSelected) {
        obliquesPath.classList.remove("clicked");
        musclesSelected = musclesSelected.filter(item => item !== "Obliques");
        
      } else {
        obliquesPath.classList.add("clicked");
        if (!musclesSelected.includes("Obliques")) {
        musclesSelected.push("Obliques");
        setText();
        }
      }
      setText();
    });
    if (musclesSelected.length < 1) {
      document.getElementById("muscleName").textContent = HTMLMuscList;
    }
    baseobliquesSelected = !baseobliquesSelected; 
  });
});

let trapspaths = Array.from(document.querySelectorAll(".trapezius"));
trapspaths.forEach(function(path) {
  path.addEventListener("click", function() {

    trapspaths.forEach(function(trapsPath) {

      if (basetrapsSelected) {
        trapsPath.classList.remove("clicked");
        musclesSelected = musclesSelected.filter(item => item !== "Traps");
        
      } else {
        trapsPath.classList.add("clicked");
        if (!musclesSelected.includes("Traps")) {
        musclesSelected.push("Traps");
        setText();
        }
      }
      setText();
    });
    if (musclesSelected.length < 1) {
      document.getElementById("muscleName").textContent = HTMLMuscList;
    }
    basetrapsSelected = !basetrapsSelected; 
  });
});

let waistpaths = Array.from(document.querySelectorAll(".waist"));
waistpaths.forEach(function(path) {
  path.addEventListener("click", function() {

    waistpaths.forEach(function(waistPath) {

      if (basewaistSelected) {
        waistPath.classList.remove("clicked");
        musclesSelected = musclesSelected.filter(item => item !== "Hips");
        
      } else {
        waistPath.classList.add("clicked");
        if (!musclesSelected.includes("Hips")) {
        musclesSelected.push("Hips");
        setText();
        }
      }
      setText();
    });
    if (musclesSelected.length < 1) {
      document.getElementById("muscleName").textContent = HTMLMuscList;
    }
    basewaistSelected = !basewaistSelected; 
  });
});

let calvespaths = Array.from(document.querySelectorAll(".calves"));
calvespaths.forEach(function(path) {
  path.addEventListener("click", function() {

    calvespaths.forEach(function(calvesPath) {

      if (basecalvesSelected) {
        calvesPath.classList.remove("clicked");
        musclesSelected = musclesSelected.filter(item => item !== "Calves");
        
      } else {
        calvesPath.classList.add("clicked");
        if (!musclesSelected.includes("Calves")) {
        musclesSelected.push("Calves");
        setText();
        }
      }
      setText();
    });
    if (musclesSelected.length < 1) {
      document.getElementById("muscleName").textContent = HTMLMuscList;
    }
    basecalvesSelected = !basecalvesSelected; 
  });
});

let quadspaths = Array.from(document.querySelectorAll(".quads"));
quadspaths.forEach(function(path) {
  path.addEventListener("click", function() {

    quadspaths.forEach(function(quadsPath) {

      if (basequadsSelected) {
        quadsPath.classList.remove("clicked");
        musclesSelected = musclesSelected.filter(item => item !== "Quads");
        
      } else {
        quadsPath.classList.add("clicked");
        if (!musclesSelected.includes("Quads")) {
        musclesSelected.push("Quads");
        setText();
        }
      }
      setText();
    });
    if (musclesSelected.length < 1) {
      document.getElementById("muscleName").textContent = HTMLMuscList;
    }
    basequadsSelected = !basequadsSelected; 
  });
});

let adductorpaths = Array.from(document.querySelectorAll(".adductors"));
adductorpaths.forEach(function(path) {
  path.addEventListener("click", function() {

    adductorpaths.forEach(function(adductorPath) {

      if (baseadductorsSelected) {
        adductorPath.classList.remove("clicked");
        musclesSelected = musclesSelected.filter(item => item !== "Adductors");
        
      } else {
        adductorPath.classList.add("clicked");
        if (!musclesSelected.includes("Adductors")) {
        musclesSelected.push("Adductors");
        setText();
        }
      }
      setText();
    });
    if (musclesSelected.length < 1) {
      document.getElementById("muscleName").textContent = HTMLMuscList;
    }
    baseadductorsSelected = !baseadductorsSelected; 
  });
});

const majorSelectorButton = document.getElementById("majorSelectorButton");
majorSelectorButton.addEventListener("click", function() {
  if (ButtonOn) {
    document.getElementById("majorSelectorButton").innerText = "Enable Major Selector";
    ButtonOn = false;
    console.log("buttonOn " + ButtonOn);
    majorGroupSelected = false;
    majorGroup();
  
  } else {
    ButtonOn = true;
    console.log("buttonOn " + ButtonOn);
    document.getElementById("majorSelectorButton").innerText = "Disable Major Selector";
    majorGroupSelected = true;
    majorGroup();
  }
});

const resetButton = document.getElementById("resetButton");
resetButton.addEventListener("click", resetButtonClicked);



function resetButtonClicked() {
  if (musclesSelected.length > 0) {
    musclesSelected.length = 0;
    baseChestSelected = false;
    baseTricepSelected = false;
    baseforearmSelected = false;
    baseshoulderSelected = false;
    basebicepSelected = false;
    baseabsSelected = false;
    baseobliquesSelected = false;
    basetrapsSelected = false;
    basewaistSelected = false;
    basequadsSelected = false;
    basecalvesSelected = false;
    baseadductorsSelected = false;
    majorGroupUpper = false;
    majorGroupLower = false;
    setText();
    document.getElementById("muscleName").textContent = HTMLMuscList

    Array.from(document.querySelectorAll('.clicked')).forEach(
      (el) => el.classList.remove('clicked')
    );
    }
    }


let upperbodypaths = Array.from(document.querySelectorAll(".upperbody"))
let lowerbodypaths = Array.from(document.querySelectorAll(".lowerbody"))

function majorGroup() {
  if (majorGroupSelected) {
    console.log("majorgroup function begin");
    upperbodypaths.forEach(function (path) {
      path.removeEventListener("click", handleUpperbodyClick);
    });
    upperbodypaths.forEach(function (path) {
      path.addEventListener("click", handleUpperbodyClick);
    });
    lowerbodypaths.forEach(function (path) {
      path.removeEventListener("click", handleLowerbodyClick);
    });
    lowerbodypaths.forEach(function (path) {
      path.addEventListener("click", handleLowerbodyClick);
    });

  }
  else {
    upperbodypaths.forEach(function (path) {
      path.removeEventListener("click", handleUpperbodyClick);
    });
    lowerbodypaths.forEach(function (path) {
      path.removeEventListener("click", handleLowerbodyClick);
    });


  }
}

function handleUpperbodyClick() {

  if (majorGroupSelected) {
    upperbodypaths.forEach(function (upperbodyPath) {
      if (majorGroupUpper) {
        upperbodyPath.classList.remove("clicked");
        const musclesToFilter = ["Chest", "Triceps", "Biceps", "Forearms", "Obliques", "Abs", "Traps", "Hips"];
        musclesSelected = musclesSelected.filter(item => !musclesToFilter.includes(item));
        baseChestSelected = false;
        baseTricepSelected = false;
        baseforearmSelected = false;
        baseshoulderSelected = false;
        basebicepSelected = false;
        baseabsSelected = false;
        baseobliquesSelected = false;
        basetrapsSelected = false;
        basewaistSelected = false;
      } else {
        upperbodyPath.classList.add("clicked");
        const musclesToCheck = ["Chest", "Triceps", "Biceps", "Forearms", "Obliques", "Abs", "Traps", "Hips"];
        baseChestSelected = true;
        baseTricepSelected = true;
        baseforearmSelected = true;
        baseshoulderSelected = true;
        basebicepSelected = true;
        baseabsSelected = true;
        baseobliquesSelected = true;
        basetrapsSelected = true;
        basewaistSelected = true;
        musclesToCheck.forEach(muscle => {
          if (!musclesSelected.includes(muscle)) {
            musclesSelected.push(muscle);
          }
        });
      }
    });

    setText();

    if (musclesSelected.length < 1) {
      document.getElementById("muscleName").textContent = HTMLMuscList;
    }

    majorGroupUpper = !majorGroupUpper;
    // baseChestSelected = !baseChestSelected;
    // baseTricepSelected = !baseTricepSelected;  
    
    console.log("clicking upperbody: (" + baseChestSelected + " base chest state)(" + baseTricepSelected + " base tricep state)(" + majorGroupUpper + " button-on body state)(" + ButtonOn + " buttonON)");

  }
}

function handleLowerbodyClick() {

  if (majorGroupSelected) {
    lowerbodypaths.forEach(function (lowerbodyPath) {
      if (majorGroupLower) {
        lowerbodyPath.classList.remove("clicked");
        const musclesToFilter = ["Calves", "Quads", "Adductors"];
        musclesSelected = musclesSelected.filter(item => !musclesToFilter.includes(item));
        basequadsSelected = false;
        basecalvesSelected = false;
        baseadductorsSelected = false;
      } else {
        lowerbodyPath.classList.add("clicked");
        const musclesToCheck = ["Calves", "Quads", "Adductors"];
        basequadsSelected = true;
        basecalvesSelected = true;
        baseadductorsSelected = true;
        musclesToCheck.forEach(muscle => {
          if (!musclesSelected.includes(muscle)) {
            musclesSelected.push(muscle);
          }
        });
      }
    });
    setText();
    if (musclesSelected.length < 1) {
      document.getElementById("muscleName").textContent = HTMLMuscList;
    }
    majorGroupLower = !majorGroupLower;
    }
}

const dataFromServer = {
  "Exercise List":[
   {
    "Exercise Muscle Group": "Alternating Dumbbell Bench Press",
    "Pectorals": "yes",
    "Triceps": "yes"
   },
   {
    "Exercise Muscle Group": "Assisted One-Arm Press Ups",
    "Abdominals": "Yes",
    "Pectorals": "yes",
    "Triceps": "yes",
    "Biceps": "yes",
    "Forearms": "yes"
   },
   {
    "Exercise Muscle Group": "Barbell ab rollouts",
    "Calves": "yes",
    "Gluteus": "Yes",
    "Lower\nback": "yes",
    "Trapezius": "Yes",
    "Abdominals": "Yes",
    "Pectorals": "yes",
    "Deltoids": "yes",
    "Triceps": "yes",
    "Biceps": "yes",
    "Forearms": "yes"
   },
   {
    "Exercise Muscle Group": "Barbell Bench Press",
    "Pectorals": "yes",
    "Deltoids": "some ",
    "Triceps": "yes",
    "Biceps": "minimal",
    "Forearms": "minimal"
   },
   {
    "Exercise Muscle Group": "Bench press",
    "Calves": " ",
    "Quad-\nriceps": " ",
    "Ham-\nstrings": " ",
    "Gluteus": " ",
    "Hips\nother": " ",
    "Lower\nback": "some ",
    "Lats": "some ",
    "Trapezius": "some ",
    "Abdominals": "some ",
    "Pectorals": "Yes",
    "Deltoids": "some ",
    "Triceps": "Yes",
    "Biceps": "some",
    "Forearms": "some"
   },
   {
    "Exercise Muscle Group": "Cable chest fly ",
    "Pectorals": "yes",
    "Triceps": "yes"
   },
   {
    "Exercise Muscle Group": "Decline Bench Press",
    "Pectorals": "yes",
    "Deltoids": "some ",
    "Triceps": "yes",
    "Biceps": "minimal",
    "Forearms": "minimal"
   },
   {
    "Exercise Muscle Group": "Dumbbell Bench Press",
    "Pectorals": "yes",
    "Deltoids": "some ",
    "Triceps": "yes",
    "Biceps": "minimal",
    "Forearms": "minimal"
   },
   {
    "Exercise Muscle Group": "Incline Barbell Bench Press",
    "Pectorals": "yes",
    "Deltoids": "some ",
    "Triceps": "yes",
    "Biceps": "minimal",
    "Forearms": "minimal"
   },
   {
    "Exercise Muscle Group": "Incline Dumbbell Bench Press",
    "Pectorals": "yes",
    "Deltoids": "some ",
    "Triceps": "yes",
    "Biceps": "minimal",
    "Forearms": "minimal"
   },
   {
    "Exercise Muscle Group": "Push-up",
    "Calves": " ",
    "Quad-\nriceps": " ",
    "Ham-\nstrings": " ",
    "Gluteus": " ",
    "Hips\nother": " ",
    "Lower\nback": " ",
    "Lats": " ",
    "Trapezius": " ",
    "Abdominals": " ",
    "Pectorals": "Yes",
    "Deltoids": "some ",
    "Triceps": "Yes",
    "Biceps": " ",
    "Forearms": "some"
   },
   {
    "Exercise Muscle Group": "Push-Ups",
    "Pectorals": "yes",
    "Triceps": "yes",
    "Forearms": "some"
   },
   {
    "Exercise Muscle Group": "Weighted Dips for Chest",
    "Pectorals": "yes",
    "Deltoids": "some ",
    "Triceps": "yes",
    "Biceps": "minimal",
    "Forearms": "minimal"
   },
   {
    "Exercise Muscle Group": "Cable chest press ",
    "Pectorals": "yes"
   },
   {
    "Exercise Muscle Group": "Cable Crossover",
    "Pectorals": "yes",
    "Deltoids": "some "
   },
   {
    "Exercise Muscle Group": "Chest fly",
    "Calves": " ",
    "Quad-\nriceps": " ",
    "Ham-\nstrings": " ",
    "Gluteus": " ",
    "Hips\nother": " ",
    "Lower\nback": " ",
    "Lats": " ",
    "Trapezius": " ",
    "Abdominals": " ",
    "Pectorals": "Yes",
    "Deltoids": "some ",
    "Biceps": " ",
    "Forearms": " "
   },
   {
    "Exercise Muscle Group": "Chest Supported Rows",
    "Pectorals": "yes",
    "Deltoids": "some "
   },
   {
    "Exercise Muscle Group": "Decline Push-Ups",
    "Pectorals": "yes"
   },
   {
    "Exercise Muscle Group": "Dumbbell Chest Press",
    "Pectorals": "yes"
   },
   {
    "Exercise Muscle Group": "Dumbbell Decline Chest Press",
    "Pectorals": "yes"
   },
   {
    "Exercise Muscle Group": "Dumbbell Incline Chest Press",
    "Pectorals": "yes"
   },
   {
    "Exercise Muscle Group": "Incline Bench Press",
    "Pectorals": "yes"
   },
   {
    "Exercise Muscle Group": "Overhead Press",
    "Pectorals": "yes"
   },
   {
    "Exercise Muscle Group": "Back Lever",
    "Calves": "some ",
    "Quad-\nriceps": "some ",
    "Ham-\nstrings": "some ",
    "Gluteus": "some ",
    "Hips\nother": "some",
    "Lower\nback": "some ",
    "Lats": "yes",
    "Trapezius": "yes",
    "Abdominals": "yes",
    "Pectorals": "some",
    "Deltoids": "yes",
    "Triceps": "some",
    "Biceps": "Some",
    "Forearms": "yes"
   },
   {
    "Exercise Muscle Group": "Barbell chest supported rows ",
    "Lower\nback": "yes",
    "Lats": "yes",
    "Trapezius": "yes",
    "Abdominals": "yes",
    "Pectorals": "some",
    "Deltoids": "yes",
    "Triceps": "some",
    "Biceps": "some",
    "Forearms": "minimal"
   },
   {
    "Exercise Muscle Group": "Bent-Over Barbell Row",
    "Calves": "some ",
    "Quad-\nriceps": "some ",
    "Ham-\nstrings": "Yes",
    "Gluteus": "yes",
    "Hips\nother": "some",
    "Lower\nback": "yes",
    "Lats": "some ",
    "Trapezius": "some ",
    "Abdominals": "some ",
    "Pectorals": "some",
    "Deltoids": "some ",
    "Triceps": "some",
    "Biceps": "yes",
    "Forearms": "some"
   },
   {
    "Exercise Muscle Group": "Barbell Hip Thrusts",
    "Calves": "yes",
    "Quad-\nriceps": "some ",
    "Ham-\nstrings": "Yes",
    "Gluteus": "Yes",
    "Hips\nother": "yes",
    "Lower\nback": "yes",
    "Lats": "some ",
    "Trapezius": "some ",
    "Abdominals": "some ",
    "Pectorals": "some",
    "Deltoids": "some "
   },
   {
    "Exercise Muscle Group": "Pushdown",
    "Calves": " ",
    "Quad-\nriceps": " ",
    "Ham-\nstrings": " ",
    "Gluteus": " ",
    "Hips\nother": " ",
    "Lower\nback": " ",
    "Lats": " ",
    "Trapezius": " ",
    "Abdominals": " ",
    "Pectorals": " ",
    "Deltoids": " ",
    "Triceps": "Yes",
    "Biceps": " ",
    "Forearms": " "
   },
   {
    "Exercise Muscle Group": "Shoulder press",
    "Calves": " ",
    "Quad-\nriceps": " ",
    "Ham-\nstrings": " ",
    "Gluteus": " ",
    "Hips\nother": " ",
    "Lower\nback": " ",
    "Lats": " ",
    "Trapezius": "some ",
    "Abdominals": " ",
    "Pectorals": " ",
    "Deltoids": "Yes",
    "Triceps": "Yes",
    "Biceps": " ",
    "Forearms": "minimal"
   },
   {
    "Exercise Muscle Group": "Triceps extension",
    "Calves": " ",
    "Quad-\nriceps": " ",
    "Ham-\nstrings": " ",
    "Gluteus": " ",
    "Hips\nother": " ",
    "Lower\nback": " ",
    "Lats": " ",
    "Trapezius": " ",
    "Abdominals": " ",
    "Pectorals": " ",
    "Deltoids": " ",
    "Triceps": "Yes",
    "Biceps": " ",
    "Forearms": "some"
   },
   {
    "Exercise Muscle Group": "Biceps curl",
    "Calves": " ",
    "Quad-\nriceps": " ",
    "Ham-\nstrings": " ",
    "Gluteus": " ",
    "Hips\nother": " ",
    "Lower\nback": " ",
    "Lats": " ",
    "Trapezius": " ",
    "Abdominals": " ",
    "Pectorals": " ",
    "Deltoids": " ",
    "Triceps": "some",
    "Biceps": "Yes",
    "Forearms": "some"
   },
   {
    "Exercise Muscle Group": "Back extension",
    "Calves": "some ",
    "Quad-\nriceps": " ",
    "Ham-\nstrings": "Yes",
    "Gluteus": "Yes",
    "Hips\nother": " ",
    "Lower\nback": "Yes",
    "Lats": " ",
    "Trapezius": " ",
    "Abdominals": " ",
    "Pectorals": " ",
    "Deltoids": " ",
    "Triceps": " ",
    "Biceps": " ",
    "Forearms": " "
   },
   {
    "Exercise Muscle Group": "Bent-over row",
    "Calves": " ",
    "Quad-\nriceps": " ",
    "Ham-\nstrings": "Yes",
    "Gluteus": "some ",
    "Hips\nother": "some",
    "Lower\nback": "some ",
    "Lats": "Yes",
    "Trapezius": "Yes",
    "Abdominals": "some ",
    "Pectorals": " ",
    "Deltoids": " ",
    "Triceps": " ",
    "Biceps": "Some",
    "Forearms": " "
   },
   {
    "Exercise Muscle Group": "Deadlift",
    "Calves": "some ",
    "Quad-\nriceps": "Yes",
    "Ham-\nstrings": "Yes",
    "Gluteus": "Yes",
    "Hips\nother": "Yes",
    "Lower\nback": "Yes",
    "Lats": " ",
    "Trapezius": "some ",
    "Abdominals": "some ",
    "Pectorals": " ",
    "Deltoids": " ",
    "Triceps": " ",
    "Biceps": " ",
    "Forearms": "some"
   },
   {
    "Exercise Muscle Group": "Hip adductor",
    "Calves": " ",
    "Quad-\nriceps": " ",
    "Ham-\nstrings": " ",
    "Gluteus": " ",
    "Hips\nother": "Yes",
    "Lower\nback": " ",
    "Lats": " ",
    "Trapezius": " ",
    "Abdominals": " ",
    "Pectorals": " ",
    "Deltoids": " ",
    "Triceps": " ",
    "Biceps": " ",
    "Forearms": " "
   },
   {
    "Exercise Muscle Group": "Lateral raise",
    "Calves": " ",
    "Quad-\nriceps": " ",
    "Ham-\nstrings": " ",
    "Gluteus": " ",
    "Hips\nother": "some",
    "Lower\nback": " ",
    "Lats": " ",
    "Trapezius": "some ",
    "Abdominals": "some ",
    "Pectorals": " ",
    "Deltoids": "Yes",
    "Triceps": " ",
    "Biceps": " ",
    "Forearms": " "
   },
   {
    "Exercise Muscle Group": "Leg curl",
    "Calves": "some ",
    "Quad-\nriceps": " ",
    "Ham-\nstrings": "Yes",
    "Gluteus": " ",
    "Hips\nother": " ",
    "Lower\nback": " ",
    "Lats": " ",
    "Trapezius": " ",
    "Abdominals": " ",
    "Pectorals": " ",
    "Deltoids": " ",
    "Triceps": " ",
    "Biceps": " ",
    "Forearms": " "
   },
   {
    "Exercise Muscle Group": "Leg extension",
    "Calves": "yes",
    "Quad-\nriceps": "Yes",
    "Ham-\nstrings": " ",
    "Gluteus": " ",
    "Hips\nother": " ",
    "Lower\nback": " ",
    "Lats": " ",
    "Trapezius": " ",
    "Abdominals": " ",
    "Pectorals": " ",
    "Deltoids": " ",
    "Triceps": " ",
    "Biceps": " ",
    "Forearms": " "
   },
   {
    "Exercise Muscle Group": "Leg raise",
    "Calves": "yes",
    "Quad-\nriceps": " ",
    "Ham-\nstrings": " ",
    "Gluteus": " ",
    "Hips\nother": "Yes",
    "Lower\nback": " ",
    "Lats": " ",
    "Trapezius": " ",
    "Abdominals": "some ",
    "Pectorals": " ",
    "Deltoids": " ",
    "Triceps": " ",
    "Biceps": " ",
    "Forearms": " "
   },
   {
    "Exercise Muscle Group": "Lunge",
    "Calves": "yes",
    "Quad-\nriceps": "Yes",
    "Ham-\nstrings": "Yes",
    "Gluteus": "Yes",
    "Hips\nother": "Yes",
    "Lower\nback": " ",
    "Lats": " ",
    "Trapezius": " ",
    "Abdominals": " ",
    "Pectorals": " ",
    "Deltoids": " ",
    "Triceps": " ",
    "Biceps": " ",
    "Forearms": " "
   },
   {
    "Exercise Muscle Group": "Pull-down",
    "Calves": " ",
    "Quad-\nriceps": " ",
    "Ham-\nstrings": " ",
    "Gluteus": " ",
    "Hips\nother": " ",
    "Lower\nback": " ",
    "Lats": "Yes",
    "Trapezius": "some ",
    "Abdominals": " ",
    "Pectorals": " ",
    "Deltoids": " ",
    "Triceps": " ",
    "Biceps": "Some",
    "Forearms": " "
   },
   {
    "Exercise Muscle Group": "Pull-up",
    "Calves": " ",
    "Quad-\nriceps": " ",
    "Ham-\nstrings": " ",
    "Gluteus": " ",
    "Hips\nother": " ",
    "Lower\nback": " ",
    "Lats": "Yes",
    "Trapezius": "some ",
    "Abdominals": " ",
    "Pectorals": " ",
    "Deltoids": " ",
    "Triceps": " ",
    "Biceps": "Some",
    "Forearms": "some"
   },
   {
    "Exercise Muscle Group": "Russian twist",
    "Calves": " ",
    "Quad-\nriceps": " ",
    "Ham-\nstrings": " ",
    "Gluteus": " ",
    "Hips\nother": " ",
    "Lower\nback": " ",
    "Lats": " ",
    "Trapezius": " ",
    "Abdominals": "Yes",
    "Pectorals": " ",
    "Deltoids": "    ",
    "Triceps": " ",
    "Biceps": " ",
    "Forearms": " "
   },
   {
    "Exercise Muscle Group": "Shoulder shrug",
    "Calves": " ",
    "Quad-\nriceps": " ",
    "Ham-\nstrings": " ",
    "Gluteus": " ",
    "Hips\nother": " ",
    "Lower\nback": " ",
    "Lats": " ",
    "Trapezius": "Yes",
    "Abdominals": " ",
    "Pectorals": " ",
    "Deltoids": "some ",
    "Triceps": " ",
    "Biceps": " ",
    "Forearms": "some"
   },
   {
    "Exercise Muscle Group": "Squat",
    "Calves": "some ",
    "Quad-\nriceps": "Yes",
    "Ham-\nstrings": "some ",
    "Gluteus": "Yes",
    "Hips\nother": "Yes",
    "Lower\nback": "some ",
    "Lats": " ",
    "Trapezius": " ",
    "Abdominals": "Yes",
    "Pectorals": " ",
    "Deltoids": " ",
    "Triceps": " ",
    "Biceps": " ",
    "Forearms": " "
   },
   {
    "Exercise Muscle Group": "Upright row",
    "Calves": "yes",
    "Quad-\nriceps": " ",
    "Ham-\nstrings": " ",
    "Gluteus": " ",
    "Hips\nother": " ",
    "Lower\nback": " ",
    "Lats": " ",
    "Trapezius": "Yes",
    "Abdominals": " ",
    "Pectorals": " ",
    "Deltoids": "Yes",
    "Triceps": " ",
    "Biceps": "Some",
    "Forearms": "some"
   },
   {
    "Exercise Muscle Group": "Assisted Chin Ups",
    "Lower\nback": "yes",
    "Lats": "Yes",
    "Trapezius": "Yes",
    "Abdominals": "Yes",
    "Deltoids": "yes",
    "Triceps": "yes",
    "Biceps": "yes",
    "Forearms": "yes"
   },
   {
    "Exercise Muscle Group": "ball toss crunch",
    "Gluteus": "Yes",
    "Lower\nback": "yes",
    "Abdominals": "Yes",
    "Deltoids": "yes",
    "Triceps": "yes",
    "Biceps": "yes",
    "Forearms": "yes"
   },
   {
    "Exercise Muscle Group": "Cable Face Pulls",
    "Abdominals": "some ",
    "Deltoids": "yes",
    "Triceps": "yes",
    "Biceps": "yes",
    "Forearms": "some"
   },
   {
    "Exercise Muscle Group": "Cable Push-Down",
    "Triceps": "yes"
   },
   {
    "Exercise Muscle Group": "Cable Rope Hammer Curls",
    "Triceps": "Yes",
    "Biceps": "some"
   },
   {
    "Exercise Muscle Group": "Cable Tricep Pulldowns",
    "Triceps": "Yes"
   },
   {
    "Exercise Muscle Group": "Cable Tricep Pushdowns",
    "Triceps": "Yes"
   },
   {
    "Exercise Muscle Group": "Dips",
    "Deltoids": "yes",
    "Triceps": "yes"
   },
   {
    "Exercise Muscle Group": "Dumbbell Kickback",
    "Triceps": "yes"
   },
   {
    "Exercise Muscle Group": "Seated Overhead Dumbbell Extension",
    "Triceps": "yes"
   },
   {
    "Exercise Muscle Group": "Skullcrusher",
    "Triceps": "yes"
   },
   {
    "Exercise Muscle Group": "Tricep Dips",
    "Triceps": "Yes"
   },
   {
    "Exercise Muscle Group": "Tricep Dips on Bench",
    "Triceps": "Yes"
   },
   {
    "Exercise Muscle Group": "Tricep Dips on Dip Station",
    "Triceps": "Yes"
   },
   {
    "Exercise Muscle Group": "Tricep Kickbacks",
    "Triceps": "Yes"
   },
   {
    "Exercise Muscle Group": "Tricep Kickbacks with Dumbbell",
    "Triceps": "Yes"
   },
   {
    "Exercise Muscle Group": "Tricep kickbacks ",
    "Triceps": "Yes"
   },
   {
    "Exercise Muscle Group": "Tricep Pushdowns",
    "Triceps": "Yes"
   },
   {
    "Exercise Muscle Group": "Tricep Pushdowns with Rope Attachment",
    "Triceps": "Yes"
   },
   {
    "Exercise Muscle Group": "Triceps Bench Dips",
    "Triceps": "Yes"
   },
   {
    "Exercise Muscle Group": "Weighted Dips",
    "Triceps": "yes"
   },
   {
    "Exercise Muscle Group": "Arnold Press",
    "Gluteus": "some ",
    "Lower\nback": "some ",
    "Lats": "some ",
    "Trapezius": "some ",
    "Abdominals": "some ",
    "Deltoids": "yes",
    "Triceps": "some",
    "Biceps": "some"
   },
   {
    "Exercise Muscle Group": "Barbell bicep curl ",
    "Deltoids": "some ",
    "Triceps": "some",
    "Biceps": "yes",
    "Forearms": "some"
   },
   {
    "Exercise Muscle Group": "Bicep machine curl ",
    "Deltoids": "some ",
    "Triceps": "some",
    "Biceps": "yes",
    "Forearms": "some"
   },
   {
    "Exercise Muscle Group": "Cable Hammer Curls",
    "Triceps": "some",
    "Biceps": "yes",
    "Forearms": "some"
   },
   {
    "Exercise Muscle Group": "Barbell Curls",
    "Trapezius": "minimal",
    "Triceps": "minimal",
    "Biceps": "yes",
    "Forearms": "some"
   },
   {
    "Exercise Muscle Group": "Cable Preacher Curls",
    "Triceps": "minimal",
    "Biceps": "yes",
    "Forearms": "some"
   },
   {
    "Exercise Muscle Group": "Ab crunches ",
    "Abdominals": "Yes"
   },
   {
    "Exercise Muscle Group": "Ab Wheel Rollouts",
    "Lower\nback": "yes",
    "Abdominals": "Yes"
   },
   {
    "Exercise Muscle Group": "Abs & Core",
    "Abdominals": "Yes"
   },
   {
    "Exercise Muscle Group": "Archer Press Ups"
   },
   {
    "Exercise Muscle Group": "army crawl",
    "Quad-\nriceps": "yes",
    "Hips\nother": "yes",
    "Lower\nback": "yes",
    "Trapezius": "Yes",
    "Abdominals": "Yes",
    "Deltoids": "yes",
    "Forearms": "yes"
   },
   {
    "Exercise Muscle Group": "Arnold Shoulder Press",
    "Trapezius": "Yes",
    "Deltoids": "yes"
   },
   {
    "Exercise Muscle Group": "Assisted Lunges",
    "Calves": "yes",
    "Quad-\nriceps": "yes",
    "Ham-\nstrings": "Yes",
    "Gluteus": "Yes",
    "Hips\nother": "yes",
    "Lower\nback": "yes"
   },
   {
    "Exercise Muscle Group": "Assisted Pistol Squats",
    "Calves": "yes",
    "Quad-\nriceps": "yes",
    "Ham-\nstrings": "Yes",
    "Gluteus": "Yes",
    "Hips\nother": "yes",
    "Lower\nback": "yes"
   },
   {
    "Exercise Muscle Group": "Assisted Pull Ups",
    "Lower\nback": "yes",
    "Lats": "Yes",
    "Trapezius": "Yes",
    "Abdominals": "Yes",
    "Deltoids": "yes"
   },
   {
    "Exercise Muscle Group": "Assisted Squats",
    "Calves": "yes",
    "Quad-\nriceps": "yes",
    "Ham-\nstrings": "Yes",
    "Gluteus": "Yes",
    "Hips\nother": "yes",
    "Lower\nback": "yes"
   },
   {
    "Exercise Muscle Group": "Back Squats",
    "Calves": "yes",
    "Quad-\nriceps": "yes",
    "Ham-\nstrings": "Yes",
    "Gluteus": "Yes",
    "Hips\nother": "yes",
    "Lower\nback": "yes",
    "Trapezius": "some "
   },
   {
    "Exercise Muscle Group": "Backward Lunges",
    "Calves": "yes",
    "Quad-\nriceps": "yes",
    "Ham-\nstrings": "Yes",
    "Gluteus": "Yes",
    "Hips\nother": "yes",
    "Lower\nback": "yes"
   },
   {
    "Exercise Muscle Group": "Barbell back squats ",
    "Calves": "yes",
    "Quad-\nriceps": "yes",
    "Ham-\nstrings": "Yes",
    "Gluteus": "Yes",
    "Hips\nother": "yes",
    "Lower\nback": "yes",
    "Trapezius": "some "
   },
   {
    "Exercise Muscle Group": "Barbell Bulgarian split squat ",
    "Calves": "yes",
    "Quad-\nriceps": "yes",
    "Ham-\nstrings": "Yes",
    "Gluteus": "Yes",
    "Hips\nother": "some",
    "Lower\nback": "yes"
   },
   {
    "Exercise Muscle Group": "Barbell Deadlift",
    "Lower\nback": "some ",
    "Lats": "some ",
    "Trapezius": "some ",
    "Abdominals": "some "
   },
   {
    "Exercise Muscle Group": "Barbell front squats ",
    "Calves": "yes",
    "Quad-\nriceps": "yes",
    "Ham-\nstrings": "some ",
    "Gluteus": "yes",
    "Hips\nother": "some",
    "Lower\nback": "yes",
    "Abdominals": "some ",
    "Deltoids": "some "
   },
   {
    "Exercise Muscle Group": "Barbell Hack Squats",
    "Calves": "yes",
    "Quad-\nriceps": "some ",
    "Ham-\nstrings": "some "
   },
   {
    "Exercise Muscle Group": "Barbell Jammers",
    "Lower\nback": "some ",
    "Lats": "Yes",
    "Trapezius": "Yes",
    "Abdominals": "some "
   },
   {
    "Exercise Muscle Group": "Barbell Lunges",
    "Calves": "yes",
    "Quad-\nriceps": "some ",
    "Ham-\nstrings": "some "
   },
   {
    "Exercise Muscle Group": "Barbell or Dumbbell Split Squats",
    "Calves": "yes",
    "Quad-\nriceps": "some ",
    "Ham-\nstrings": "some "
   },
   {
    "Exercise Muscle Group": "Barbell preacher curl ",
    "Biceps": "yes"
   },
   {
    "Exercise Muscle Group": "Barbell Romanian Deadlifts",
    "Calves": "yes",
    "Quad-\nriceps": "yes",
    "Ham-\nstrings": "Yes",
    "Gluteus": "Yes",
    "Hips\nother": "yes",
    "Lower\nback": "yes"
   },
   {
    "Exercise Muscle Group": "Barbell Romanian Deadlifts with Resistance Bands",
    "Calves": "yes",
    "Quad-\nriceps": "yes",
    "Ham-\nstrings": "Yes",
    "Gluteus": "Yes",
    "Hips\nother": "yes",
    "Lower\nback": "yes"
   },
   {
    "Exercise Muscle Group": "Barbell Rows",
    "Calves": "minimal",
    "Quad-\nriceps": "minimal",
    "Lats": "yes",
    "Abdominals": "some ",
    "Deltoids": "some "
   },
   {
    "Exercise Muscle Group": "Barbell Shoulder Press",
    "Calves": "minimal",
    "Quad-\nriceps": "minimal",
    "Abdominals": "some ",
    "Deltoids": "yes",
    "Forearms": "some"
   },
   {
    "Exercise Muscle Group": "Barbell shrugs ",
    "Calves": "minimal",
    "Quad-\nriceps": "minimal",
    "Trapezius": "yes"
   },
   {
    "Exercise Muscle Group": "Barbell Squat",
    "Calves": "some ",
    "Quad-\nriceps": "some ",
    "Ham-\nstrings": "some ",
    "Gluteus": "some ",
    "Lower\nback": "some ",
    "Abdominals": "some "
   },
   {
    "Exercise Muscle Group": "Barbell step-ups ",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Battle Rope Waves",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "bear crawl",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Bent-over Dumbbell Flyes",
    "Calves": "minimal",
    "Quad-\nriceps": "minimal",
    "Ham-\nstrings": "Yes"
   },
   {
    "Exercise Muscle Group": "Bent-over Dumbbell Reverse Flyes",
    "Calves": "minimal",
    "Quad-\nriceps": "minimal",
    "Ham-\nstrings": "Yes"
   },
   {
    "Exercise Muscle Group": "Bent-over Dumbbell Reverse Lunges",
    "Calves": "yes",
    "Ham-\nstrings": "Yes"
   },
   {
    "Exercise Muscle Group": "Bent-over Dumbbell Rows",
    "Calves": "some ",
    "Ham-\nstrings": "Yes"
   },
   {
    "Exercise Muscle Group": "Bent-over Dumbbell Tricep Kickbacks",
    "Ham-\nstrings": "Yes"
   },
   {
    "Exercise Muscle Group": "Bent-over Rear Delt Raises",
    "Calves": "some ",
    "Ham-\nstrings": "Yes"
   },
   {
    "Exercise Muscle Group": "Bent-Over Reverse Fly",
    "Ham-\nstrings": "Yes",
    "Deltoids": "yes"
   },
   {
    "Exercise Muscle Group": "Bicycle",
    "Calves": "yes",
    "Quad-\nriceps": "yes",
    "Ham-\nstrings": "yes",
    "Gluteus": "some ",
    "Hips\nother": "some",
    "Lower\nback": "yes",
    "Abdominals": "yes"
   },
   {
    "Exercise Muscle Group": "Bicycle Crunches",
    "Calves": "minimal"
   },
   {
    "Exercise Muscle Group": "Bicycle Crunches with Medicine Ball",
    "Calves": "minimal"
   },
   {
    "Exercise Muscle Group": "Bird Dogs"
   },
   {
    "Exercise Muscle Group": "Bodyweight Good Mornings",
    "Calves": "some "
   },
   {
    "Exercise Muscle Group": "Bottoms-Up Kettlebell Overhead Press",
    "Calves": "some ",
    "Deltoids": "yes"
   },
   {
    "Exercise Muscle Group": "Box Jumps",
    "Calves": "yes",
    "Quad-\nriceps": "yes",
    "Ham-\nstrings": "yes",
    "Gluteus": "yes",
    "Hips\nother": "some",
    "Lower\nback": "yes"
   },
   {
    "Exercise Muscle Group": "Box Squats",
    "Calves": "yes",
    "Quad-\nriceps": "yes",
    "Ham-\nstrings": "yes",
    "Gluteus": "yes",
    "Hips\nother": "some",
    "Lower\nback": "yes"
   },
   {
    "Exercise Muscle Group": "Bulgarian Split Squats",
    "Calves": "yes",
    "Quad-\nriceps": "yes",
    "Ham-\nstrings": "yes",
    "Gluteus": "yes",
    "Hips\nother": "some",
    "Lower\nback": "yes"
   },
   {
    "Exercise Muscle Group": "Bulgarian Split Squats with Barbell",
    "Calves": "yes",
    "Quad-\nriceps": "yes",
    "Ham-\nstrings": "yes",
    "Gluteus": "yes",
    "Hips\nother": "some",
    "Lower\nback": "yes"
   },
   {
    "Exercise Muscle Group": "Bulgarian Split Squats with Dumbbells",
    "Calves": "yes",
    "Quad-\nriceps": "yes",
    "Ham-\nstrings": "yes",
    "Gluteus": "yes",
    "Hips\nother": "some",
    "Lower\nback": "yes"
   },
   {
    "Exercise Muscle Group": "Burpees",
    "Calves": "yes",
    "Quad-\nriceps": "yes",
    "Ham-\nstrings": "yes",
    "Gluteus": "yes",
    "Hips\nother": "some",
    "Lower\nback": "yes"
   },
   {
    "Exercise Muscle Group": "Cable bicep curl ",
    "Biceps": "yes",
    "Forearms": "some"
   },
   {
    "Exercise Muscle Group": "Cable Bicep Curls",
    "Biceps": "yes",
    "Forearms": "some"
   },
   {
    "Exercise Muscle Group": "Cable Concentration Curls",
    "Biceps": "yes",
    "Forearms": "some"
   },
   {
    "Exercise Muscle Group": "Cable Crunch",
    "Lower\nback": "yes",
    "Abdominals": "yes"
   },
   {
    "Exercise Muscle Group": "Cable crunches ",
    "Lower\nback": "yes",
    "Abdominals": "yes"
   },
   {
    "Exercise Muscle Group": "Cable Flyes"
   },
   {
    "Exercise Muscle Group": "Cable Front Raises",
    "Trapezius": "some ",
    "Deltoids": "yes",
    "Forearms": "some"
   },
   {
    "Exercise Muscle Group": "Cable Lateral Lunges",
    "Calves": "yes",
    "Quad-\nriceps": "yes",
    "Ham-\nstrings": "yes",
    "Gluteus": "yes",
    "Hips\nother": "yes",
    "Lower\nback": "yes",
    "Abdominals": "some "
   },
   {
    "Exercise Muscle Group": "Cable Lateral Raises",
    "Lats": "Yes",
    "Trapezius": "some ",
    "Deltoids": "yes",
    "Forearms": "some"
   },
   {
    "Exercise Muscle Group": "Cable Lateral Raises with Resistance Band",
    "Lats": "Yes",
    "Trapezius": "some ",
    "Deltoids": "yes",
    "Forearms": "some"
   },
   {
    "Exercise Muscle Group": "Cable Pull Throughs",
    "Calves": "some ",
    "Quad-\nriceps": "some "
   },
   {
    "Exercise Muscle Group": "Cable Rear Delt Flyes",
    "Deltoids": "yes"
   },
   {
    "Exercise Muscle Group": "Cable reverse fly ",
    "Lats": "Yes",
    "Trapezius": "Yes"
   },
   {
    "Exercise Muscle Group": "Cable Reverse Flyes",
    "Lats": "Yes",
    "Trapezius": "Yes"
   },
   {
    "Exercise Muscle Group": "Cable Rope Face Pulls",
    "Trapezius": "Yes",
    "Deltoids": "yes",
    "Biceps": "yes"
   },
   {
    "Exercise Muscle Group": "Cable Side Lateral Raises",
    "Lats": "Yes",
    "Abdominals": "yes",
    "Deltoids": "yes"
   },
   {
    "Exercise Muscle Group": "Cable Upright Rows",
    "Trapezius": "Yes",
    "Deltoids": "yes"
   },
   {
    "Exercise Muscle Group": "Cable Woodchoppers",
    "Hips\nother": "yes",
    "Lower\nback": "yes",
    "Abdominals": "yes"
   },
   {
    "Exercise Muscle Group": "Calf Press",
    "Calves": "yes",
    "Quad-\nriceps": "some ",
    "Ham-\nstrings": "some ",
    "Gluteus": "some ",
    "Lower\nback": "some ",
    "Abdominals": "some "
   },
   {
    "Exercise Muscle Group": "Calf Raises",
    "Calves": "yes",
    "Quad-\nriceps": "some ",
    "Ham-\nstrings": "Yes"
   },
   {
    "Exercise Muscle Group": "Captain’s Chair Leg Raise",
    "Calves": "some ",
    "Quad-\nriceps": "yes",
    "Lower\nback": "some ",
    "Abdominals": "Yes"
   },
   {
    "Exercise Muscle Group": "Chaturanga Planks",
    "Calves": "minimal"
   },
   {
    "Exercise Muscle Group": "Chin Ups"
   },
   {
    "Exercise Muscle Group": "Close grip bench press "
   },
   {
    "Exercise Muscle Group": "Close Grip Push-ups"
   },
   {
    "Exercise Muscle Group": "Close-Grip Pulldown",
    "Lower\nback": "some ",
    "Lats": "some ",
    "Trapezius": "some ",
    "Abdominals": "some "
   },
   {
    "Exercise Muscle Group": "Concentration Curls"
   },
   {
    "Exercise Muscle Group": "Conventional Barbell Deadlifts"
   },
   {
    "Exercise Muscle Group": "Crab Walks"
   },
   {
    "Exercise Muscle Group": "Crunches",
    "Abdominals": "yes"
   },
   {
    "Exercise Muscle Group": "Cuban press "
   },
   {
    "Exercise Muscle Group": "Curtsy Lunges",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Dead Bugs"
   },
   {
    "Exercise Muscle Group": "Dead Hangs"
   },
   {
    "Exercise Muscle Group": "Deadlifts"
   },
   {
    "Exercise Muscle Group": "Decline barbell bench press "
   },
   {
    "Exercise Muscle Group": "Decline dumbbell bench press "
   },
   {
    "Exercise Muscle Group": "Decline Lunges",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "depth jumps",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Dip machine "
   },
   {
    "Exercise Muscle Group": "dive bomber"
   },
   {
    "Exercise Muscle Group": "Dive Bomber Press Ups"
   },
   {
    "Exercise Muscle Group": "Donkey Kicks"
   },
   {
    "Exercise Muscle Group": "Dragon Flag"
   },
   {
    "Exercise Muscle Group": "dragon walk"
   },
   {
    "Exercise Muscle Group": "Dumbbell Arnold Press"
   },
   {
    "Exercise Muscle Group": "Dumbbell Bent-over Rear Delt Raises"
   },
   {
    "Exercise Muscle Group": "Dumbbell Bent-over Reverse Flyes"
   },
   {
    "Exercise Muscle Group": "Dumbbell Bicep Curls"
   },
   {
    "Exercise Muscle Group": "Dumbbell Bulgarian Split Squats"
   },
   {
    "Exercise Muscle Group": "Dumbbell chest fly ",
    "Biceps": "yes"
   },
   {
    "Exercise Muscle Group": "Dumbbell Deadlift to Upright Row"
   },
   {
    "Exercise Muscle Group": "Dumbbell Farmers Walk"
   },
   {
    "Exercise Muscle Group": "Dumbbell floor press "
   },
   {
    "Exercise Muscle Group": "Dumbbell Flyes"
   },
   {
    "Exercise Muscle Group": "Dumbbell Front Raises"
   },
   {
    "Exercise Muscle Group": "Dumbbell front squat ",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Dumbbell glute bridges ",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Dumbbell Goblet Squats",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Dumbbell Hammer Curls"
   },
   {
    "Exercise Muscle Group": "Dumbbell hip thrusts ",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Dumbbell I, Y, and T Raises"
   },
   {
    "Exercise Muscle Group": "Dumbbell Incline Press"
   },
   {
    "Exercise Muscle Group": "Dumbbell Lateral Lunges",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Dumbbell Lateral Raises"
   },
   {
    "Exercise Muscle Group": "Dumbbell Lunge",
    "Calves": "some ",
    "Quad-\nriceps": "some",
    "Ham-\nstrings": "some ",
    "Gluteus": "some ",
    "Lower\nback": "some ",
    "Abdominals": "some "
   },
   {
    "Exercise Muscle Group": "Dumbbell Lunges",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Dumbbell Pullovers"
   },
   {
    "Exercise Muscle Group": "Dumbbell Punches",
    "Calves": "some "
   },
   {
    "Exercise Muscle Group": "Dumbbell Renegade Rows"
   },
   {
    "Exercise Muscle Group": "Dumbbell Renegade Rows with Push-ups"
   },
   {
    "Exercise Muscle Group": "Dumbbell reverse flys "
   },
   {
    "Exercise Muscle Group": "dumbbell rollback extensions"
   },
   {
    "Exercise Muscle Group": "Dumbbell Romanian Deadlifts"
   },
   {
    "Exercise Muscle Group": "Dumbbell Rows",
    "Biceps": "yes"
   },
   {
    "Exercise Muscle Group": "Dumbbell Running Arm Swings"
   },
   {
    "Exercise Muscle Group": "Dumbbell Shoulder Press"
   },
   {
    "Exercise Muscle Group": "Dumbbell Shrugs"
   },
   {
    "Exercise Muscle Group": "Dumbbell Step-ups"
   },
   {
    "Exercise Muscle Group": "Dumbbell Stiff-legged Deadlifts"
   },
   {
    "Exercise Muscle Group": "Dumbbell Tricep Extensions"
   },
   {
    "Exercise Muscle Group": "Dumbbell Walking Lunges"
   },
   {
    "Exercise Muscle Group": "E-Z bar bicep curl "
   },
   {
    "Exercise Muscle Group": "Face Pulls"
   },
   {
    "Exercise Muscle Group": "Farmer’s Carries"
   },
   {
    "Exercise Muscle Group": "Farmers walk "
   },
   {
    "Exercise Muscle Group": "Feet Elevated One-Arm Press Ups"
   },
   {
    "Exercise Muscle Group": "Feet Elevated Pike Press Ups"
   },
   {
    "Exercise Muscle Group": "Feet Elevated Press Ups"
   },
   {
    "Exercise Muscle Group": "Fire Hydrants"
   },
   {
    "Exercise Muscle Group": "Flag",
    "Abdominals": "yes"
   },
   {
    "Exercise Muscle Group": "Flat barbell bench press "
   },
   {
    "Exercise Muscle Group": "Flat dumbbell bench press "
   },
   {
    "Exercise Muscle Group": "Flat machine bench press "
   },
   {
    "Exercise Muscle Group": "Flutter Kicks"
   },
   {
    "Exercise Muscle Group": "Forward ball slams"
   },
   {
    "Exercise Muscle Group": "Forward Lunges",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Forward Raises",
    "Deltoids": "yes"
   },
   {
    "Exercise Muscle Group": "Front Dumbbell Raise",
    "Deltoids": "yes"
   },
   {
    "Exercise Muscle Group": "Front Lever"
   },
   {
    "Exercise Muscle Group": "Front Rack Reverse Lunges"
   },
   {
    "Exercise Muscle Group": "Front Raises"
   },
   {
    "Exercise Muscle Group": "Front Squats"
   },
   {
    "Exercise Muscle Group": "Full Body & Cardio",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Glute Bridge",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Glute Bridges",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Glute-Ham Raises",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Goblet squat ",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Goblet Squats",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "goblet step ups",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Good Mornings",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Guillotine (neck) press "
   },
   {
    "Exercise Muscle Group": "Hack Squat",
    "Calves": "some ",
    "Quad-\nriceps": "some",
    "Ham-\nstrings": "some ",
    "Gluteus": "some ",
    "Lower\nback": "some ",
    "Abdominals": "some "
   },
   {
    "Exercise Muscle Group": "Hack squat machine ",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Hack Squats",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "half-get ups"
   },
   {
    "Exercise Muscle Group": "Hammer Curls"
   },
   {
    "Exercise Muscle Group": "Hammer Strength Chest Press"
   },
   {
    "Exercise Muscle Group": "Hammer Strength Rows"
   },
   {
    "Exercise Muscle Group": "Hamstring Curls"
   },
   {
    "Exercise Muscle Group": "Handstand Holds"
   },
   {
    "Exercise Muscle Group": "Handstand Push-ups",
    "Deltoids": "yes"
   },
   {
    "Exercise Muscle Group": "Hanging Dumbbell Knee Raise",
    "Calves": "yes",
    "Abdominals": "yes"
   },
   {
    "Exercise Muscle Group": "Hanging Knee Raises",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Hanging Leg Raises",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Hip Thrusts"
   },
   {
    "Exercise Muscle Group": "hollow hold"
   },
   {
    "Exercise Muscle Group": "hollow rocks"
   },
   {
    "Exercise Muscle Group": "Human Flag"
   },
   {
    "Exercise Muscle Group": "inchworms",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Incline bench dumbbell curl "
   },
   {
    "Exercise Muscle Group": "Incline Dumbbell Curls"
   },
   {
    "Exercise Muscle Group": "Incline Dumbbell Flyes"
   },
   {
    "Exercise Muscle Group": "Incline Dumbbell Press"
   },
   {
    "Exercise Muscle Group": "Incline machine bench press "
   },
   {
    "Exercise Muscle Group": "Incline-Bench Curl",
    "Biceps": "yes"
   },
   {
    "Exercise Muscle Group": "Inverted Rows",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Jogging on the Spot",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Jumping Lunges",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Kettlebell Goblet Lunges",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Kettlebell Goblet Squats",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Kettlebell Sumo Deadlifts",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Kettlebell Sumo Squats",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Kettlebell Swings",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "kettlebell: farmers carry",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "kettlebell: farmers lunges",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "kettlebell: figure-8 swings",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "kettlebell: goblet lunges",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "kettlebell: push up to dip"
   },
   {
    "Exercise Muscle Group": "kettlebell: single arm overhead lunges",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "kettlebell: single-leg romanian deadlifts",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "kettlebell: swings American",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "kettlebell: swings Russian",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "kettlebell: turkish get-ups"
   },
   {
    "Exercise Muscle Group": "kettlebell: windmills",
    "Calves": " "
   },
   {
    "Exercise Muscle Group": "Knee raises ",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Landmine",
    "Calves": "yes",
    "Abdominals": "Yes"
   },
   {
    "Exercise Muscle Group": "Landmines",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Lat Pulldowns",
    "Lats": "yes"
   },
   {
    "Exercise Muscle Group": "lat pulldowns: narrow grip"
   },
   {
    "Exercise Muscle Group": "lat pulldowns: wide grip"
   },
   {
    "Exercise Muscle Group": "lateral ball slams"
   },
   {
    "Exercise Muscle Group": "Lateral hops"
   },
   {
    "Exercise Muscle Group": "Lateral Lunges",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Lateral Raises",
    "Lats": "yes"
   },
   {
    "Exercise Muscle Group": "Leg Lifts",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Leg Press",
    "Calves": "some ",
    "Quad-\nriceps": "yes",
    "Ham-\nstrings": "some ",
    "Gluteus": "yes",
    "Lower\nback": "some ",
    "Abdominals": "some "
   },
   {
    "Exercise Muscle Group": "Leg Press Calf Raises",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Leg press ",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Leg raises ",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Legs Bent Inverted Rows"
   },
   {
    "Exercise Muscle Group": "L-sits"
   },
   {
    "Exercise Muscle Group": "Lunge Jumps",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Lunges",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Lying Leg Raises",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Machine lat raise "
   },
   {
    "Exercise Muscle Group": "Machine shoulder press "
   },
   {
    "Exercise Muscle Group": "Machine tricep kickbacks "
   },
   {
    "Exercise Muscle Group": "Medicine Ball Chops"
   },
   {
    "Exercise Muscle Group": "Medicine Ball Slams",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Medicine Ball Slams against Wall",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Medicine Ball Woodchoppers",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Military Press",
    "Calves": "yes",
    "Deltoids": "yes"
   },
   {
    "Exercise Muscle Group": "Mini-hops",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Mixed Grip Press Ups"
   },
   {
    "Exercise Muscle Group": "Mountain Climbers",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Muscle Ups"
   },
   {
    "Exercise Muscle Group": "Narrow-Grip Pulldowns",
    "Lats": "yes"
   },
   {
    "Exercise Muscle Group": "Negative Chin Ups"
   },
   {
    "Exercise Muscle Group": "Negative Neutral Grin Chin Ups"
   },
   {
    "Exercise Muscle Group": "Negative Pull Ups"
   },
   {
    "Exercise Muscle Group": "Neutral Grip Chin Ups"
   },
   {
    "Exercise Muscle Group": "nordic ball toss"
   },
   {
    "Exercise Muscle Group": "nordic hamstring curls"
   },
   {
    "Exercise Muscle Group": "One-Arm Chin Ups"
   },
   {
    "Exercise Muscle Group": "One-arm Dumbbell Rows"
   },
   {
    "Exercise Muscle Group": "One-Arm Press Ups"
   },
   {
    "Exercise Muscle Group": "overhead plate lunges",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Overhead Tricep Cable Extensions"
   },
   {
    "Exercise Muscle Group": "Overhead Tricep Dumbbell Extensions"
   },
   {
    "Exercise Muscle Group": "Overhead Tricep Extensions"
   },
   {
    "Exercise Muscle Group": "Pallof Presses",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "partner medicine ball side tosses"
   },
   {
    "Exercise Muscle Group": "partner russian twists"
   },
   {
    "Exercise Muscle Group": "Pause Squats",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Pec dec "
   },
   {
    "Exercise Muscle Group": "Pendley rows "
   },
   {
    "Exercise Muscle Group": "Pike Press Ups"
   },
   {
    "Exercise Muscle Group": "Pistol Box Squats",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Pistol Squats",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Planche Hold",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Plank",
    "Calves": "yes",
    "Abdominals": "yes"
   },
   {
    "Exercise Muscle Group": "Plank Hold with Shoulder Taps",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Plank hold ",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Plank Holds",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Plank Jacks",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Plank with Arm Raises",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Plank with Knee to Elbow Crunches",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Plank with Leg Lifts",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Plank with Shoulder Taps",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Plank: bird dogs",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "plank: figure 8 ball",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Plank: Medball planks",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Plank: shoulder taps",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Plank: side plank",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "plank: walk ups",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Planks",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Plate hops"
   },
   {
    "Exercise Muscle Group": "pole scissors"
   },
   {
    "Exercise Muscle Group": "pole v-ups"
   },
   {
    "Exercise Muscle Group": "Power Cleans",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Preacher Curls"
   },
   {
    "Exercise Muscle Group": "Preacher EZ-Bar Curl",
    "Biceps": "yes"
   },
   {
    "Exercise Muscle Group": "Press Up from the Knees"
   },
   {
    "Exercise Muscle Group": "Prone Back Extensions"
   },
   {
    "Exercise Muscle Group": "Pull Ups"
   },
   {
    "Exercise Muscle Group": "Pull-Ups",
    "Deltoids": "yes",
    "Biceps": "yes"
   },
   {
    "Exercise Muscle Group": "Push Jerks",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Push press "
   },
   {
    "Exercise Muscle Group": "Push up: bird dog "
   },
   {
    "Exercise Muscle Group": "push up: bosu"
   },
   {
    "Exercise Muscle Group": "Push up: decline"
   },
   {
    "Exercise Muscle Group": "push up: diamond"
   },
   {
    "Exercise Muscle Group": "Push up: hand-release"
   },
   {
    "Exercise Muscle Group": "Push up: medicine ball"
   },
   {
    "Exercise Muscle Group": "Push up: plyometric"
   },
   {
    "Exercise Muscle Group": "Push up: renegade row"
   },
   {
    "Exercise Muscle Group": "Push up: ring"
   },
   {
    "Exercise Muscle Group": "push up: weighted"
   },
   {
    "Exercise Muscle Group": "pushdown: standing"
   },
   {
    "Exercise Muscle Group": "Quads, Hamstring, Glutes & Calves"
   },
   {
    "Exercise Muscle Group": "Renegade Rows",
    "Calves": "yes",
    "Biceps": "yes"
   },
   {
    "Exercise Muscle Group": "Renegade Rows with Dumbbells",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Resistance Band Bicep Curls"
   },
   {
    "Exercise Muscle Group": "Resistance Band Bicep Hammer Curls"
   },
   {
    "Exercise Muscle Group": "Resistance Band Lat Pulldowns"
   },
   {
    "Exercise Muscle Group": "Resistance Band Lateral Raises"
   },
   {
    "Exercise Muscle Group": "Reverse Crunches"
   },
   {
    "Exercise Muscle Group": "Reverse Fly"
   },
   {
    "Exercise Muscle Group": "Reverse Flyes"
   },
   {
    "Exercise Muscle Group": "Reverse Lunges",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Romanian Deadlift",
    "Calves": "some ",
    "Quad-\nriceps": "some ",
    "Ham-\nstrings": "some ",
    "Gluteus": "some ",
    "Lower\nback": "some ",
    "Abdominals": "some "
   },
   {
    "Exercise Muscle Group": "Rotational Sit Ups",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Russian Dips"
   },
   {
    "Exercise Muscle Group": "Russian Leg Curl",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "russian taps"
   },
   {
    "Exercise Muscle Group": "Russian Twist with Medicine Ball"
   },
   {
    "Exercise Muscle Group": "Seated barbell shoulder press "
   },
   {
    "Exercise Muscle Group": "Seated Cable Row",
    "Lower\nback": "some ",
    "Lats": "some ",
    "Trapezius": "some ",
    "Abdominals": "some "
   },
   {
    "Exercise Muscle Group": "Seated Calf Raises"
   },
   {
    "Exercise Muscle Group": "Seated Calf Raises with Barbell"
   },
   {
    "Exercise Muscle Group": "Seated Calf Raises with Dumbbells"
   },
   {
    "Exercise Muscle Group": "Seated Dumbbell Concentration Curls"
   },
   {
    "Exercise Muscle Group": "Seated Dumbbell Curls"
   },
   {
    "Exercise Muscle Group": "Seated Dumbbell Overhead Press",
    "Deltoids": "yes"
   },
   {
    "Exercise Muscle Group": "Seated Dumbbell Press"
   },
   {
    "Exercise Muscle Group": "Seated Dumbbell Shoulder Press"
   },
   {
    "Exercise Muscle Group": "Seated dumbbell shoulder press "
   },
   {
    "Exercise Muscle Group": "Seated Hammer Curl",
    "Biceps": "yes"
   },
   {
    "Exercise Muscle Group": "Seated overhead extension "
   },
   {
    "Exercise Muscle Group": "seated rows: narrow grip"
   },
   {
    "Exercise Muscle Group": "seated rows: wide grip"
   },
   {
    "Exercise Muscle Group": "Seated Shoulder Press"
   },
   {
    "Exercise Muscle Group": "Shrimp Squats",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Shrugs",
    "Deltoids": "yes"
   },
   {
    "Exercise Muscle Group": "Side bends "
   },
   {
    "Exercise Muscle Group": "Side Lunges",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Side Plank",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Side Plank Hip Raises",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Side plank hold ",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Side to Side Pull Ups"
   },
   {
    "Exercise Muscle Group": "Single arm dumbbell press "
   },
   {
    "Exercise Muscle Group": "Single Arm Overhead Lunges",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Single Arm Rows"
   },
   {
    "Exercise Muscle Group": "Single Leg Romanian Deadlifts",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Single-arm Dumbbell Rows"
   },
   {
    "Exercise Muscle Group": "Single-Leg Calf Raises",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Single-leg Deadlifts",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Single-Leg Dumbbell Romanian Deadlifts",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Single-leg Glute Bridge",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Single-Leg Hip Thrusts",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Sit up machine "
   },
   {
    "Exercise Muscle Group": "Sit Ups"
   },
   {
    "Exercise Muscle Group": "Skull crushers "
   },
   {
    "Exercise Muscle Group": "Smith Machine Squats"
   },
   {
    "Exercise Muscle Group": "Spiderman Press Ups",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "spiderman push ups",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Split Squats",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Split Squats with Dumbbells",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Sprints on the Spot",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Squat Jumps",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Squat Pulses",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Squat Thrusts",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Squats",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Stability Ball Crunches"
   },
   {
    "Exercise Muscle Group": "Stability Ball Leg Curl"
   },
   {
    "Exercise Muscle Group": "Stability Ball Tucks and Jackknives "
   },
   {
    "Exercise Muscle Group": "stance jacks"
   },
   {
    "Exercise Muscle Group": "Standard deadlift ",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Standard Press Ups",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Standing Barbell Curl",
    "Calves": "yes",
    "Biceps": "yes"
   },
   {
    "Exercise Muscle Group": "Standing Barbell Overhead Press",
    "Calves": "yes",
    "Deltoids": "yes"
   },
   {
    "Exercise Muscle Group": "Standing barbell shoulder press ",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Standing Cable Chest Flyes",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Standing Cable Curl",
    "Calves": "yes",
    "Biceps": "yes"
   },
   {
    "Exercise Muscle Group": "Standing Calf Raise",
    "Calves": "yes",
    "Quad-\nriceps": "some ",
    "Ham-\nstrings": "some ",
    "Gluteus": "some ",
    "Lower\nback": "some ",
    "Abdominals": "some "
   },
   {
    "Exercise Muscle Group": "Standing Calf Raises",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Standing calf raises ",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Standing Dumbbell Hammer Curls",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Standing Dumbbell Press",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Standing dumbbell shoulder press ",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Standing Inverted Rows",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Standing Military Press",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Standing overhead extension ",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Standing T-Bar Row",
    "Calves": "yes",
    "Lower\nback": "some ",
    "Lats": "some ",
    "Trapezius": "some ",
    "Abdominals": "some "
   },
   {
    "Exercise Muscle Group": "Standing T-Bar Rows",
    "Calves": "yes",
    "Biceps": "yes"
   },
   {
    "Exercise Muscle Group": "Star Jumps",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Static Lunges",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Step Ups",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Step-Ups",
    "Calves": "yes",
    "Gluteus": "some "
   },
   {
    "Exercise Muscle Group": "Step-ups with Dumbbells",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Stiff-legged Deadlifts",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Suitcase Deadlifts"
   },
   {
    "Exercise Muscle Group": "Sumo Deadlift High Pull",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Sumo deadlift ",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Sumo Deadlifts",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Sumo Squats",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Sumo Squats with Barbell",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Sumo Squats with Kettlebell",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Superman",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "superman hold"
   },
   {
    "Exercise Muscle Group": "Swiss Ball Crunches",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Swiss Ball Hamstring Curls",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Swiss Ball Jackknife",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Swiss Ball Leg Curl",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Swiss Ball Pike",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Swiss Ball Plank",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Swiss Ball Plank Pike",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Swiss Ball Rollouts",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Swiss Ball Russian Twists",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Swiss Ball Stir the Pot",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "T-bar Rows",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "team russian twists"
   },
   {
    "Exercise Muscle Group": "Thrusters",
    "Calves": "yes",
    "Hips\nother": "yes",
    "Lower\nback": "some "
   },
   {
    "Exercise Muscle Group": "transverse ball slams",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Trap Bar Deadlift",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "T-Spine Rotation Planks"
   },
   {
    "Exercise Muscle Group": "Tuck Jumps",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Underhand EZ Bar Rows",
    "Biceps": "yes"
   },
   {
    "Exercise Muscle Group": "Underhand Grip Inverted Rows"
   },
   {
    "Exercise Muscle Group": "Upright Barbell Rows",
    "Calves": "yes",
    "Biceps": "yes",
    "Forearms": "minimal"
   },
   {
    "Exercise Muscle Group": "Upright Rows",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "V-Ups"
   },
   {
    "Exercise Muscle Group": "Walking Lunges",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Walking Lunges with Barbell",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Walking Lunges with Dumbbells",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Wall Sits",
    "Calves": "some ",
    "Quad-\nriceps": "yes",
    "Ham-\nstrings": "some ",
    "Gluteus": "yes",
    "Hips\nother": "some",
    "Lower\nback": "minimal",
    "Abdominals": "some "
   },
   {
    "Exercise Muscle Group": "wall walks",
    "Calves": "yes"
   },
   {
    "Exercise Muscle Group": "Weighted Chin-ups",
    "Trapezius": "some ",
    "Abdominals": "some ",
    "Deltoids": "yes",
    "Biceps": "yes"
   },
   {
    "Exercise Muscle Group": "Weighted Decline Sit-up",
    "Abdominals": "Yes"
   },
   {
    "Exercise Muscle Group": "Weighted Decline Sit-ups"
   },
   {
    "Exercise Muscle Group": "Weighted Pull-ups",
    "Lower\nback": "some ",
    "Lats": "some ",
    "Trapezius": "some ",
    "Abdominals": "some "
   },
   {
    "Exercise Muscle Group": "Weighted Russian Twists"
   },
   {
    "Exercise Muscle Group": "Wide Grip Press Ups"
   },
   {
    "Exercise Muscle Group": "Wide-Grip Pulldown",
    "Lower\nback": "some ",
    "Lats": "some ",
    "Trapezius": "some ",
    "Abdominals": "some "
   },
   {
    "Exercise Muscle Group": "Wide-Grip Pulldowns",
    "Lats": "yes"
   },
   {
    "Exercise Muscle Group": "Wide-Grip Pull-up",
    "Lower\nback": "some ",
    "Lats": "some ",
    "Trapezius": "some ",
    "Abdominals": "some "
   },
   {
    "Exercise Muscle Group": "Windshield Wipers",
    "Lower\nback": "yes",
    "Abdominals": "yes"
   },
   {
    "Exercise Muscle Group": "wolf raise"
   },
   {
    "Exercise Muscle Group": "Zottman Curl",
    "Biceps": "yes"
   }
  ]};

// Find exercises that target a specific muscle
function findExercisesByMuscle(muscle) {
  const exercises = [];
  dataFromServer['Exercise List'].forEach(exercise => {
    if (exercise[muscle] && exercise[muscle] === 'yes') {
      exercises.push(exercise['Exercise Muscle Group']);
    }
  });
  return exercises;
}

// Find muscles targeted by a specific exercise
function findMusclesByExercise(exerciseName) {
  const muscles = [];
  const exercise = dataFromServer['Exercise List'].find(exercise => exercise['Exercise Muscle Group'] === exerciseName);
  if (exercise) {
    for (const key in exercise) {
      if (key !== 'Exercise Muscle Group' && exercise[key] === 'yes') {
        muscles.push(key);
      }
    }
  }
  return muscles;
}

// Example usage
const muscleExercises = findExercisesByMuscle('Pectorals');
console.log('Exercises for Pectorals:', muscleExercises);

const exerciseMuscles = findMusclesByExercise('Barbell ab rollouts');
console.log('Muscles used in Barbell ab rollouts:', exerciseMuscles);

