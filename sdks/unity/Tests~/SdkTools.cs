// Outils d'éditeur pour le SDK (hors paquet : le dossier « Tests~ » est ignoré par Unity).
// Copiés dans Assets/Editor d'un projet de test par e2e/tests/sdk-unity.spec.ts, ou à la main :
//   Unity -batchmode -nographics -quit -projectPath <projet> -executeMethod SdkTools.BuildPrefab
//   Unity -batchmode -nographics -projectPath <projet> -executeMethod SdkTools.RunSmoke
//         -smokeKey das_pub_… -smokeUrl http://localhost:3000 -smokeOut <dossier>
//   Unity -batchmode -quit -projectPath <projet> -executeMethod SdkTools.BuildShotPlayer (mêmes arguments) -shotApp <Jeu.app>
using System;
using System.IO;
using DevAppStore;
using UnityEditor;
using UnityEditor.Events;
using UnityEditor.SceneManagement;
using UnityEngine;

public static class SdkTools
{
    const string PrefabDir = "Packages/com.devappstore.sdk/Prefabs";
    const string PrefabPath = PrefabDir + "/DevAppStore.prefab";

    /// <summary>Régénère le prefab « Dev AppStore » (client + composant glisser-déposer) dans le paquet.</summary>
    public static void BuildPrefab()
    {
        Directory.CreateDirectory(Path.GetFullPath(PrefabDir));
        AssetDatabase.Refresh();
        var go = new GameObject("Dev AppStore");
        go.AddComponent<DevAppStoreClient>();
        go.AddComponent<DevAppStoreDropIn>();
        PrefabUtility.SaveAsPrefabAsset(go, PrefabPath, out bool ok);
        UnityEngine.Object.DestroyImmediate(go);
        AssetDatabase.SaveAssets();
        Debug.Log("SDKTOOLS prefab ok=" + ok);
        if (!ok) EditorApplication.Exit(2);
    }

    /// <summary>
    /// Essai de bout en bout en mode Play : pose le prefab dans une scène vide, branche « On Item Granted » comme dans
    /// l'inspecteur, demande un code de liaison et attend un achat. Voir SmokeProbe pour les fichiers écrits.
    /// </summary>
    public static void RunSmoke()
    {
        string key = Arg("-smokeKey"), url = Arg("-smokeUrl"), outDir = Arg("-smokeOut");
        PlayerSettings.insecureHttpOption = InsecureHttpOption.AlwaysAllowed; // http://localhost en développement

        var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
        var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(PrefabPath);
        if (prefab == null) { Debug.LogError("SDKTOOLS prefab introuvable : " + PrefabPath); EditorApplication.Exit(2); return; }
        var go = (GameObject)PrefabUtility.InstantiatePrefab(prefab);

        var client = new SerializedObject(go.GetComponent<DevAppStoreClient>());
        client.FindProperty("publishableKey").stringValue = key;
        client.FindProperty("baseUrl").stringValue = url;
        client.FindProperty("pollIntervalSeconds").floatValue = 5f;
        client.FindProperty("linkPollSeconds").floatValue = 1f;
        client.ApplyModifiedPropertiesWithoutUndo();

        var probe = new GameObject("Probe").AddComponent<SmokeProbe>();
        probe.outDir = outDir;
        // Même branchement que le glisser-déposer de l'inspecteur : écouteur persistant, sérialisé dans la scène.
        var drop = go.GetComponent<DevAppStoreDropIn>();
        UnityEventTools.AddPersistentListener(drop.onItemGranted, probe.Grant);
        UnityEventTools.AddPersistentListener(drop.onItemRevoked, probe.Revoke);
        EditorUtility.SetDirty(drop);

        EditorSceneManager.SaveScene(scene, "Assets/Smoke.unity");
        EditorApplication.EnterPlaymode();
    }

    /// <summary>
    /// Construit un petit jeu macOS (scène vide + prefab) qui photographie l'interface intégrée : sert à vérifier l'écran
    /// IMGUI dans un vrai build et à produire les captures de la documentation. Arguments de RunSmoke, plus -shotApp.
    /// </summary>
    public static void BuildShotPlayer()
    {
        string key = Arg("-smokeKey"), url = Arg("-smokeUrl"), outDir = Arg("-smokeOut"), app = Arg("-shotApp");
        PlayerSettings.insecureHttpOption = InsecureHttpOption.AlwaysAllowed;
        PlayerSettings.fullScreenMode = FullScreenMode.Windowed;
        PlayerSettings.defaultScreenWidth = 960;
        PlayerSettings.defaultScreenHeight = 600;
        PlayerSettings.resizableWindow = false;
        PlayerSettings.runInBackground = true;

        var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
        var cam = new GameObject("Camera").AddComponent<Camera>();
        cam.clearFlags = CameraClearFlags.SolidColor;
        cam.backgroundColor = new Color(0.16f, 0.12f, 0.34f);
        var go = (GameObject)PrefabUtility.InstantiatePrefab(AssetDatabase.LoadAssetAtPath<GameObject>(PrefabPath));
        var client = new SerializedObject(go.GetComponent<DevAppStoreClient>());
        client.FindProperty("publishableKey").stringValue = key;
        client.FindProperty("baseUrl").stringValue = url;
        client.ApplyModifiedPropertiesWithoutUndo();
        new GameObject("Shots").AddComponent<ShotProbe>().outDir = outDir;
        EditorSceneManager.SaveScene(scene, "Assets/Shots.unity");

        var report = BuildPipeline.BuildPlayer(new[] { "Assets/Shots.unity" }, app, BuildTarget.StandaloneOSX, BuildOptions.None);
        Debug.Log("SDKTOOLS build " + report.summary.result);
        EditorApplication.Exit(report.summary.result == UnityEditor.Build.Reporting.BuildResult.Succeeded ? 0 : 2);
    }

    static string Arg(string name)
    {
        string[] args = Environment.GetCommandLineArgs();
        int i = Array.IndexOf(args, name);
        if (i < 0 || i + 1 >= args.Length) throw new ArgumentException("Argument manquant : " + name);
        return args[i + 1];
    }
}
