// Editor-side setup: the project wants gamma colour space (so blending matches the browser canvas) and one scene in
// the build. Also a command-line Linux build, for checking the game from a terminal:
//   Unity -batchmode -quit -projectPath unity -executeMethod Brumafolha.ProjectSetup.BuildLinux
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace Brumafolha
{
    [InitializeOnLoad]
    public static class ProjectSetup
    {
        const string ScenePath = "Assets/Scenes/Main.unity";

        static ProjectSetup() { EditorApplication.delayCall += Ensure; }

        static void Ensure()
        {
            if (PlayerSettings.colorSpace != ColorSpace.Gamma) PlayerSettings.colorSpace = ColorSpace.Gamma;
            if (!System.IO.File.Exists(ScenePath))
            {
                var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
                EditorSceneManager.SaveScene(scene, ScenePath);
            }
            if (EditorBuildSettings.scenes.Length == 0) EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(ScenePath, true) };
        }

        public static void BuildLinux()
        {
            Ensure();
            PlayerSettings.fullScreenMode = FullScreenMode.Windowed;
            PlayerSettings.defaultScreenWidth = 1280; PlayerSettings.defaultScreenHeight = 720;
            var report = BuildPipeline.BuildPlayer(new[] { ScenePath }, "Builds/Linux/Brumafolha.x86_64", BuildTarget.StandaloneLinux64, BuildOptions.None);
            Debug.Log("Build result: " + report.summary.result);
            if (report.summary.result != UnityEditor.Build.Reporting.BuildResult.Succeeded) EditorApplication.Exit(1);
        }
    }
}
