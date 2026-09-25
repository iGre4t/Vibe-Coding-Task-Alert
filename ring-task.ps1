$ErrorActionPreference = 'Stop'

if (-not ('TaskAlarm.Audio' -as [type])) {
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

namespace TaskAlarm {
  enum EDataFlow { Render, Capture, All }
  enum ERole { Console, Multimedia, Communications }

  [Flags]
  enum ClsCtx : uint {
    InprocServer = 0x1,
    InprocHandler = 0x2,
    LocalServer = 0x4,
    RemoteServer = 0x10,
    All = InprocServer | InprocHandler | LocalServer | RemoteServer
  }

  [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
  class MMDeviceEnumeratorComObject { }

  [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDeviceEnumerator {
    int EnumAudioEndpoints(EDataFlow dataFlow, uint stateMask, IntPtr devices);
    int GetDefaultAudioEndpoint(EDataFlow dataFlow, ERole role, out IMMDevice endpoint);
  }

  [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDevice {
    int Activate(ref Guid interfaceId, ClsCtx context, IntPtr activationParameters,
      [MarshalAs(UnmanagedType.IUnknown)] out object activatedInterface);
  }

  [ComImport, Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioEndpointVolume {
    int RegisterControlChangeNotify(IntPtr notify);
    int UnregisterControlChangeNotify(IntPtr notify);
    int GetChannelCount(out uint channelCount);
    int SetMasterVolumeLevel(float levelDb, Guid eventContext);
    int SetMasterVolumeLevelScalar(float level, Guid eventContext);
    int GetMasterVolumeLevel(out float levelDb);
    int GetMasterVolumeLevelScalar(out float level);
    int SetChannelVolumeLevel(uint channel, float levelDb, Guid eventContext);
    int SetChannelVolumeLevelScalar(uint channel, float level, Guid eventContext);
    int GetChannelVolumeLevel(uint channel, out float levelDb);
    int GetChannelVolumeLevelScalar(uint channel, out float level);
    int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, Guid eventContext);
    int GetMute([MarshalAs(UnmanagedType.Bool)] out bool mute);
  }

  public static class Audio {
    static IAudioEndpointVolume Endpoint() {
      var enumerator = (IMMDeviceEnumerator)new MMDeviceEnumeratorComObject();
      IMMDevice device;
      Marshal.ThrowExceptionForHR(enumerator.GetDefaultAudioEndpoint(EDataFlow.Render, ERole.Multimedia, out device));
      var id = typeof(IAudioEndpointVolume).GUID;
      object value;
      Marshal.ThrowExceptionForHR(device.Activate(ref id, ClsCtx.All, IntPtr.Zero, out value));
      return (IAudioEndpointVolume)value;
    }

    public static float Volume {
      get { float value; Marshal.ThrowExceptionForHR(Endpoint().GetMasterVolumeLevelScalar(out value)); return value; }
      set { Marshal.ThrowExceptionForHR(Endpoint().SetMasterVolumeLevelScalar(Math.Max(0, Math.Min(1, value)), Guid.Empty)); }
    }

    public static bool Muted {
      get { bool value; Marshal.ThrowExceptionForHR(Endpoint().GetMute(out value)); return value; }
      set { Marshal.ThrowExceptionForHR(Endpoint().SetMute(value, Guid.Empty)); }
    }
  }
}
'@
}

$previousVolume = [TaskAlarm.Audio]::Volume
$previousMute = [TaskAlarm.Audio]::Muted

try {
  [TaskAlarm.Audio]::Muted = $false
  [TaskAlarm.Audio]::Volume = 1.0
  Invoke-WebRequest -UseBasicParsing -Method Post 'http://127.0.0.1:47831/ring' -TimeoutSec 5 | Out-Null
  Start-Sleep -Milliseconds 2100
}
finally {
  [TaskAlarm.Audio]::Volume = $previousVolume
  [TaskAlarm.Audio]::Muted = $previousMute
}

[pscustomobject]@{
  Alarm = 'rung'
  PreviousVolumePercent = [math]::Round($previousVolume * 100)
  PreviousMute = $previousMute
  RestoredVolumePercent = [math]::Round([TaskAlarm.Audio]::Volume * 100)
  RestoredMute = [TaskAlarm.Audio]::Muted
}
